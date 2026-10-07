import { agent, snapshot } from "@shared/herdr/fixtures/snapshot";
import type { AgentStatus } from "@shared/herdr/schema";
import { JEREMY, type PoolFrame, type PoolView } from "@shared/pool";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELIGIBLE_AFTER_MS, WINNER_PAUSE_MS } from "./lounge";
import { PoolService, WALK_MS } from "./service";

function office(statuses: Readonly<Record<string, AgentStatus>>) {
	return snapshot({
		agents: Object.entries(statuses).map(([name, status], i) => ({
			...agent(name, `w1:p${i + 1}`),
			agent_status: status,
		})),
	});
}

function harness(open: readonly string[] = [], brainstorming: readonly string[] = []) {
	const views: PoolView[] = [];
	const frames: PoolFrame[] = [];
	const digests: PoolView[] = [];
	const service = new PoolService({
		seed: 4,
		emit: (view) => views.push(view),
		emitFrame: (frame) => frames.push(frame),
		isOpen: (paneId) => open.includes(paneId),
		inBrainstorm: (name) => brainstorming.includes(name),
		saveDigest: async (view) => {
			digests.push(view);
		},
	});
	return { service, views, frames, digests };
}

describe("PoolService", () => {
	beforeEach(() => vi.useFakeTimers({ now: 0 }));
	afterEach(() => vi.useRealTimers());

	it("starts a game a minute after two agents go idle, walks them over, then plays it out with frames", () => {
		const { service, frames, digests } = harness();
		service.start();
		service.updateSnapshot(office({ theo: "idle", mika: "done" }));
		vi.advanceTimersByTime(ELIGIBLE_AFTER_MS);
		expect(service.view()).toMatchObject({
			stage: "playing",
			mode: "game",
			moving: false,
			shot: 0,
		});
		expect(digests.at(-1)?.stage).toBe("playing");

		vi.advanceTimersByTime(WALK_MS);
		expect(service.view().moving).toBe(true);
		expect(frames[0]).toMatchObject({ shot: 1, t: 0 });
		vi.advanceTimersByTime(60_000);
		expect(frames.length).toBeGreaterThan(10);
		const view = service.view();
		expect(view.shot).toBeGreaterThan(1);
		expect(view.recent.length).toBeGreaterThan(0);
		service.stop();
	});

	it("doesn't count an agent Jeremy has open in terminal focus, or one in a brainstorm, as idle", () => {
		for (const { open, brainstorming } of [
			{ open: ["w1:p2"], brainstorming: [] },
			{ open: [], brainstorming: ["mika"] },
		]) {
			const { service } = harness(open, brainstorming);
			service.start();
			service.updateSnapshot(office({ theo: "idle", mika: "idle" }));
			vi.advanceTimersByTime(ELIGIBLE_AFTER_MS);
			expect(service.view()).toMatchObject({ mode: "practice", shooter: "theo" });
			service.stop();
		}
	});

	it("sends a prompted agent back to its desk; an emptied side forfeits", () => {
		const { service } = harness();
		service.start();
		service.updateSnapshot(office({ theo: "idle", mika: "idle" }));
		vi.advanceTimersByTime(ELIGIBLE_AFTER_MS);
		service.updateSnapshot(office({ theo: "working", mika: "idle" }));
		expect(service.view()).toMatchObject({
			stage: "finished",
			result: { players: ["mika"] },
			label: "mika wins",
		});
		service.stop();
	});

	it("shows the winner for the full pause after the balls stop, even when the game ended mid-roll", () => {
		const { service, frames } = harness();
		service.start();
		service.updateSnapshot(office({ theo: "idle", mika: "idle" }));
		vi.advanceTimersByTime(ELIGIBLE_AFTER_MS + WALK_MS);
		expect(service.view().moving).toBe(true);
		const breaker = service.view().shooter ?? "";
		const other = breaker === "theo" ? "mika" : "theo";
		// The breaker is prompted while the break rolls: the other side wins once the balls stop.
		service.updateSnapshot(office({ [breaker]: "working", [other]: "idle" }));
		while (service.view().moving) vi.advanceTimersByTime(100);
		// Long enough that a pause counted from the strike would visibly end early.
		expect(frames.at(-1)?.t ?? 0).toBeGreaterThan(1);
		expect(service.view()).toMatchObject({ stage: "finished", label: `${other} wins` });
		vi.advanceTimersByTime(WINNER_PAUSE_MS - 200);
		expect(service.view().stage).toBe("finished");
		vi.advanceTimersByTime(200);
		expect(service.view()).toMatchObject({ stage: "playing", mode: "practice", shooter: other });
		service.stop();
	});

	it("keeps no clock running while nobody is around", () => {
		const { service } = harness();
		service.start();
		expect(vi.getTimerCount()).toBe(0);
		service.updateSnapshot(office({ theo: "working" }));
		expect(vi.getTimerCount()).toBe(0);
		service.updateSnapshot(office({ theo: "idle" }));
		expect(vi.getTimerCount()).toBe(1);
		service.stop();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("waits for Jeremy's shot while he's in table view, and plays it on autopilot when he isn't", () => {
		const { service } = harness();
		service.start();
		expect(service.join()).toEqual({ ok: true });
		service.setViewing(true);
		expect(service.view()).toMatchObject({
			mode: "practice",
			shooter: JEREMY,
			ballInHand: "kitchen",
			jeremy: { yourTurn: true },
		});
		vi.advanceTimersByTime(WALK_MS * 3);
		expect(service.view().shot).toBe(0);

		expect(service.shoot({ angle: 0, power: 0.9 })).toEqual({
			ok: false,
			reason: "place the cue ball first",
		});
		expect(service.shoot({ angle: 0, power: 0.9, cue: { x: -0.6, y: 0 } })).toEqual({ ok: true });
		expect(service.shoot({ angle: 0, power: 0.5 })).toEqual({
			ok: false,
			reason: "wait for the balls to stop",
		});
		vi.advanceTimersByTime(60_000);
		expect(service.view()).toMatchObject({ moving: false, shot: 1 });

		service.setViewing(false);
		vi.advanceTimersByTime(60_000);
		expect(service.view().shot).toBeGreaterThan(1);
		expect(service.leave()).toEqual({ ok: true });
		expect(service.view().stage).toBe("resting");
		service.stop();
	});

	it("refuses Jeremy's shot when it isn't his turn", () => {
		const { service } = harness();
		service.start();
		expect(service.shoot({ angle: 0, power: 0.5 })).toEqual({ ok: false, reason: "no game is on" });
		service.updateSnapshot(office({ theo: "idle" }));
		vi.advanceTimersByTime(ELIGIBLE_AFTER_MS);
		expect(service.shoot({ angle: 0, power: 0.5 })).toEqual({
			ok: false,
			reason: "it's not your shot",
		});
		service.stop();
	});
});
