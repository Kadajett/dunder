import { avatarStyleFor } from "@shared/avatar/style";
import { agent, snapshot, workspace } from "@shared/herdr/fixtures/snapshot";
import { describe, expect, it } from "vitest";
import { rosterSchema } from "./roster";
import {
	activeAgents,
	adoptLiveAgents,
	EMPTY_ROSTER,
	fireAgent,
	hireAgent,
	ImmutableIdentityError,
	type RosterPatch,
	syncSessions,
	updateAgent,
} from "./roster-ops";

const NOW = new Date("2026-10-06T12:00:00.000Z");
const LATER = new Date("2026-10-07T12:00:00.000Z");

function ids(): () => string {
	let next = 0;
	return () => `id-${++next}`;
}

const office = snapshot({
	workspaces: [workspace("w1", "sales"), workspace("w2", "delivery")],
	agents: [agent("nora", "w1:p1", "/s/nora.jsonl"), agent("ava", "w2:p1")],
});

describe("adoptLiveAgents", () => {
	it("hires every named live omp agent with its room, cwd, session and a snapshotted style", () => {
		const roster = adoptLiveAgents(EMPTY_ROSTER, office, NOW, ids());
		expect(roster.agents).toEqual([
			expect.objectContaining({
				id: "id-1",
				name: "nora",
				workspaceLabel: "sales",
				cwd: "/work",
				harness: "omp",
				lastSessionPath: "/s/nora.jsonl",
				style: avatarStyleFor("nora"),
				createdAt: NOW.toISOString(),
			}),
			expect.objectContaining({ id: "id-2", name: "ava", workspaceLabel: "delivery" }),
		]);
		expect(roster.agents[1]).not.toHaveProperty("lastSessionPath");
	});

	it("skips unnamed, non-omp and unsafely named agents, so the saved roster stays loadable", () => {
		const claude = { ...agent("cleo", "w1:p2"), agent: "claude" };
		const unnamed = { ...agent("x", "w1:p3"), name: undefined };
		const unsafe = agent("../evil name", "w1:p5");
		const roster = adoptLiveAgents(
			EMPTY_ROSTER,
			snapshot({ workspaces: [workspace("w1", "sales")], agents: [claude, unnamed, unsafe] }),
			NOW,
			ids(),
		);
		expect(roster.agents).toEqual([]);
	});

	it("never re-creates an identity on re-observation, even for a fired worker", () => {
		const custom = { ...avatarStyleFor("someone-else") };
		const first = hireAgent(
			EMPTY_ROSTER,
			{ name: "nora", role: "lead", workspaceLabel: "hq", cwd: "/a", style: custom },
			NOW,
			"orig",
		);
		const fired = fireAgent(first, "orig", NOW);
		const again = adoptLiveAgents(fired, office, LATER, ids());
		const nora = again.agents.filter((a) => a.name === "nora");
		expect(nora).toEqual([expect.objectContaining({ id: "orig", style: custom, role: "lead" })]);
		expect(nora[0]?.createdAt).toBe(NOW.toISOString());
	});
});

describe("hireAgent", () => {
	it("rejects a name already on the roster", () => {
		const roster = adoptLiveAgents(EMPTY_ROSTER, office, NOW, ids());
		expect(() =>
			hireAgent(roster, { name: "ava", role: "r", workspaceLabel: "w", cwd: "/" }, NOW, "z"),
		).toThrow(/already/);
	});

	it("stores a copy of the chosen style, so later mutation of the input cannot change it", () => {
		const style = avatarStyleFor("pick");
		const roster = hireAgent(
			EMPTY_ROSTER,
			{ name: "pia", role: "r", workspaceLabel: "w", cwd: "/", style },
			NOW,
			"p",
		);
		style.pants = "#000000";
		expect(roster.agents[0]?.style).toEqual(avatarStyleFor("pick"));
	});
});

describe("updateAgent", () => {
	const roster = adoptLiveAgents(EMPTY_ROSTER, office, NOW, ids());

	it("changes mutable fields only on the target worker", () => {
		const next = updateAgent(roster, "id-2", { role: "designer", model: "m" });
		expect(next.agents[1]).toMatchObject({ role: "designer", model: "m", name: "ava" });
		expect(next.agents[0]).toBe(roster.agents[0]);
	});

	it.each(["name", "style", "id", "createdAt"])("refuses to rewrite %s", (field) => {
		const patch = { [field]: "hacked" } as RosterPatch;
		expect(() => updateAgent(roster, "id-1", patch)).toThrow(ImmutableIdentityError);
	});
});

describe("fireAgent", () => {
	it("keeps the worker on the roster but drops it from the active staff", () => {
		const roster = fireAgent(adoptLiveAgents(EMPTY_ROSTER, office, NOW, ids()), "id-1", LATER);
		expect(roster.agents).toHaveLength(2);
		expect(roster.agents[0]?.firedAt).toBe(LATER.toISOString());
		expect(activeAgents(roster).map((a) => a.name)).toEqual(["ava"]);
	});
});

describe("syncSessions", () => {
	const roster = adoptLiveAgents(EMPTY_ROSTER, office, NOW, ids());

	it("returns the same roster when herdr reports nothing new", () => {
		expect(syncSessions(roster, office)).toBe(roster);
	});

	it("records the latest session path herdr reports and keeps the old one when absent", () => {
		const moved = snapshot({
			workspaces: office.workspaces,
			agents: [agent("nora", "w1:p1", "/s/nora-2.jsonl"), agent("ava", "w2:p1")],
		});
		const next = syncSessions(roster, moved);
		expect(next.agents[0]?.lastSessionPath).toBe("/s/nora-2.jsonl");
		expect(next.agents[0]?.style).toEqual(roster.agents[0]?.style);
		const gone = syncSessions(next, snapshot({ workspaces: office.workspaces }));
		expect(gone).toBe(next);
	});
});

describe("rosterSchema", () => {
	it("round-trips a roster through JSON", () => {
		const roster = fireAgent(adoptLiveAgents(EMPTY_ROSTER, office, NOW, ids()), "id-2", LATER);
		expect(rosterSchema.parse(JSON.parse(JSON.stringify(roster)))).toEqual(roster);
	});

	it("rejects duplicate names and unknown versions", () => {
		const roster = adoptLiveAgents(EMPTY_ROSTER, office, NOW, ids());
		const [nora] = roster.agents;
		expect(
			rosterSchema.safeParse({ ...roster, agents: [nora, { ...nora, id: "x" }] }).success,
		).toBe(false);
		expect(rosterSchema.safeParse({ ...roster, version: 2 }).success).toBe(false);
	});
});
