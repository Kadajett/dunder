import type { Roster } from "@shared/company/roster";
import { adoptLiveAgents, EMPTY_ROSTER, fireAgent, hireAgent } from "@shared/company/roster-ops";
import { agent, pane, snapshot, workspace } from "@shared/herdr/fixtures/snapshot";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { describe, expect, it } from "vitest";
import { afterFailure, MISSING_GRACE_MS, type PlanInput, planSpawns, trackMissing } from "./plan";

const T0 = 1_000_000;
const DUE = T0 + MISSING_GRACE_MS;
const workspaces = [workspace("w1", "sales"), workspace("w2", "delivery")];
const full = snapshot({
	workspaces,
	agents: [
		agent("nora", "w1:p1", "/s/nora.jsonl"),
		agent("jonas", "w1:p4", "/s/jonas.jsonl"),
		agent("ava", "w2:p1", "/s/ava.jsonl"),
	],
});
const roster: Roster = adoptLiveAgents(EMPTY_ROSTER, full, new Date(T0), () => crypto.randomUUID());

/** Plan against `current`, as if every roster worker absent from it went missing at T0. */
function plan(current: SessionSnapshot, overrides: Partial<PlanInput> = {}) {
	const base: PlanInput = {
		roster,
		snapshot: current,
		now: DUE,
		missingSince: trackMissing(new Map(), overrides.roster ?? roster, current, T0),
		attempts: new Map(),
		existingSessions: new Set(["/s/nora.jsonl", "/s/jonas.jsonl", "/s/ava.jsonl"]),
		lastPane: new Map(),
		promptDir: "/prompts",
	};
	return planSpawns({ ...base, ...overrides });
}

const withoutJonas = snapshot({
	workspaces,
	panes: [pane("w1:p2")],
	agents: [agent("nora", "w1:p1"), agent("ava", "w2:p1")],
});

describe("planSpawns", () => {
	it("plans nothing while every roster worker is live", () => {
		expect(plan(full)).toEqual([]);
	});

	it("respawns a missing worker in yolo mode, resuming its last session", () => {
		const [spawn, ...rest] = plan(withoutJonas);
		expect(rest).toEqual([]);
		expect(spawn?.agent.name).toBe("jonas");
		expect(spawn?.args).toEqual([
			"--approval-mode=yolo",
			"--append-system-prompt=/prompts/jonas.md",
			"--resume=/s/jonas.jsonl",
		]);
		expect(spawn?.promptPath).toBe("/prompts/jonas.md");
		expect(spawn?.target).toEqual({ kind: "split", paneId: "w1:p2" });
	});

	it("starts fresh when the session file is gone, and passes the model", () => {
		const modelled = {
			...roster,
			agents: roster.agents.map((a) => (a.name === "jonas" ? { ...a, model: "m/x" } : a)),
		};
		const [spawn] = plan(withoutJonas, { roster: modelled, existingSessions: new Set() });
		expect(spawn?.args).toEqual([
			"--approval-mode=yolo",
			"--append-system-prompt=/prompts/jonas.md",
			"--model=m/x",
		]);
	});

	it("waits out the grace period before respawning", () => {
		expect(plan(withoutJonas, { now: DUE - 1 })).toEqual([]);
	});

	it("never respawns a fired worker", () => {
		const jonas = roster.agents.find((a) => a.name === "jonas");
		const fired = fireAgent(roster, jonas?.id ?? "", new Date(T0));
		expect(plan(withoutJonas, { roster: fired })).toEqual([]);
	});

	it("skips workers backing off after a failed start until the retry time", () => {
		const attempts = new Map([["jonas", afterFailure(undefined, DUE)]]);
		expect(plan(withoutJonas, { attempts })).toEqual([]);
		expect(plan(withoutJonas, { attempts, now: DUE + 10_000 })).toHaveLength(1);
	});

	it("reuses the worker's old pane when it is back at a bare shell", () => {
		const [spawn] = plan(withoutJonas, { lastPane: new Map([["jonas", "w1:p2"]]) });
		expect(spawn?.target).toEqual({ kind: "reuse", paneId: "w1:p2" });
	});

	it("does not reuse a pane another agent now occupies", () => {
		const [spawn] = plan(withoutJonas, { lastPane: new Map([["jonas", "w1:p1"]]) });
		expect(spawn?.target).toEqual({ kind: "split", paneId: "w1:p2" });
	});

	it("opens a new tab when the active tab is full", () => {
		const crowded = snapshot({
			workspaces,
			panes: [pane("w1:p2"), pane("w1:p3"), pane("w1:p5")],
			agents: [agent("nora", "w1:p1"), agent("ava", "w2:p1")],
		});
		expect(plan(crowded)[0]?.target).toEqual({ kind: "tab", workspaceId: "w1" });
	});

	it("creates a missing workspace once per round, even for several of its workers", () => {
		const onlySales = snapshot({
			workspaces: [workspace("w1", "sales")],
			agents: [agent("nora", "w1:p1"), agent("jonas", "w1:p4")],
		});
		const bigger = hireAgent(
			roster,
			{ name: "ben", role: "r", workspaceLabel: "delivery", cwd: "/work" },
			new Date(T0),
			"ben",
		);
		const plans = plan(onlySales, { roster: bigger });
		expect(plans.map((p) => [p.agent.name, p.target])).toEqual([
			["ava", { kind: "workspace", label: "delivery" }],
		]);
	});

	it("never gives two workers the same host pane in one round", () => {
		const salesGone = snapshot({
			workspaces,
			panes: [pane("w1:p2")],
			agents: [agent("ava", "w2:p1")],
		});
		expect(plan(salesGone).map((p) => [p.agent.name, p.target])).toEqual([
			["nora", { kind: "split", paneId: "w1:p2" }],
			["jonas", { kind: "tab", workspaceId: "w1" }],
		]);
	});
});

describe("trackMissing", () => {
	it("keeps the first time a worker went missing and forgets workers that came back", () => {
		const first = trackMissing(new Map(), roster, withoutJonas, T0);
		expect([...first]).toEqual([["jonas", T0]]);
		const still = trackMissing(first, roster, withoutJonas, T0 + 5);
		expect(still.get("jonas")).toBe(T0);
		expect(trackMissing(still, roster, full, T0 + 10).size).toBe(0);
	});
});

describe("afterFailure", () => {
	it("doubles the retry delay up to a cap", () => {
		const one = afterFailure(undefined, 0);
		const two = afterFailure(one, 0);
		expect([one.retryAt, two.retryAt]).toEqual([10_000, 20_000]);
		let many = two;
		for (let i = 0; i < 20; i++) many = afterFailure(many, 0);
		expect(many.retryAt).toBe(10 * 60_000);
	});
});
