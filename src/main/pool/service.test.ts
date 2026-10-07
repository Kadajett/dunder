import { agent, snapshot } from "@shared/herdr/fixtures/snapshot";
import type { AgentStatus } from "@shared/herdr/schema";
import {
	JEREMY,
	type PoolFrame,
	type PoolView,
	VIEWING_GRACE_MS,
	VIEWING_PING_MS,
} from "@shared/pool";
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

	it("never plays Jeremy's shot while his table view pings, and plays it after the grace once he leaves", () => {
		const { service } = harness();
		service.start();
		expect(service.join()).toEqual({ ok: true });
		// The open table view pings every 2 s, whatever the window's focus.
		const aim = (ms: number): void => {
			for (let waited = 0; waited < ms; waited += VIEWING_PING_MS) {
				service.setViewing(true);
				vi.advanceTimersByTime(VIEWING_PING_MS);
			}
		};
		aim(60_000);
		expect(service.view()).toMatchObject({
			mode: "practice",
			shooter: JEREMY,
			ballInHand: "kitchen",
			shot: 0,
			jeremy: { viewing: true, yourTurn: true, autopilotAt: null },
		});

		expect(service.shoot({ angle: 0, power: 0.9 })).toEqual({
			ok: false,
			reason: "place the cue ball first",
		});
		expect(service.shoot({ angle: 0, power: 0.9, cue: { x: -0.6, y: 0 } })).toEqual({ ok: true });
		expect(service.shoot({ angle: 0, power: 0.5 })).toEqual({
			ok: false,
			reason: "wait for the balls to stop",
		});
		aim(60_000);
		expect(service.view()).toMatchObject({ moving: false, shot: 1 });

		// He leaves: the HUD gets the time the engine takes over, after the grace.
		service.setViewing(false);
		const left = Date.now();
		const at = service.view().jeremy.autopilotAt ?? 0;
		expect(at).toBeGreaterThan(left + VIEWING_GRACE_MS);
		vi.advanceTimersByTime(at - left - 1);
		expect(service.view().moving).toBe(false);
		vi.advanceTimersByTime(1);
		expect(service.view().moving).toBe(true);
		vi.advanceTimersByTime(60_000);
		expect(service.view().shot).toBeGreaterThan(1);
		expect(service.leave()).toEqual({ ok: true });
		expect(service.view().stage).toBe("resting");
		service.stop();
	});

	it("takes Jeremy's shot once the table view's pings stop, even if it never said it closed", () => {
		const { service } = harness();
		service.start();
		service.join();
		service.setViewing(true);
		vi.advanceTimersByTime(VIEWING_GRACE_MS + WALK_MS - 1);
		expect(service.view().moving).toBe(false);
		vi.advanceTimersByTime(1);
		expect(service.view().moving).toBe(true);
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
