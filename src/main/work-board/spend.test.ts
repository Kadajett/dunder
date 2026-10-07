import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { spendInSpan } from "../office-stats/cost-entries";
import type { Bead } from "./cards";
import { beadSpend, withSpend } from "./spend";

const H = 3_600_000;
const T0 = Date.parse("2026-10-07T10:00:00Z");
const iso = (at: number) => new Date(at).toISOString();

/** theo spent $1 an hour on the hour from 10:00; nora has a session; ben is on another harness. */
const sessions = [
	{ agent: "theo", all: [0, 1, 2, 3, 4].map((h) => ({ at: T0 + h * H, usd: 1 })) },
	{ agent: "theo", all: [{ at: T0 + 1.5 * H, usd: 0.25 }] },
	{ agent: "nora", all: [{ at: T0 + 2 * H, usd: 5 }] },
];
const spendOf = (agent: string, from: number, to: number) => spendInSpan(sessions, agent, from, to);

const bead = (id: string, fields: Partial<Bead> = {}): Bead => ({
	id,
	title: id,
	status: "in_progress",
	priority: 2,
	issue_type: "task",
	updated_at: iso(T0),
	assignee: "theo",
	started_at: iso(T0 + 0.5 * H),
	...fields,
});
const card = (id: string, lane: WorkCard["lane"]): WorkCard => ({
	id,
	title: id,
	priority: 2,
	lane,
	assignee: "theo",
	epic: null,
	waitingOn: [],
	description: "",
	acceptance: "",
	updatedAt: iso(T0),
	startedAt: null,
	spend: null,
	epicSpend: null,
});

describe("beadSpend", () => {
	it("prices the assignee's spend from start to close, across its sessions", () => {
		expect(beadSpend(bead("a", { closed_at: iso(T0 + 2 * H) }), spendOf, T0 + 9 * H)).toBe(2.25);
	});

	it("runs to now while the bead is open", () => {
		expect(beadSpend(bead("a"), spendOf, T0 + 3 * H)).toBe(3.25);
	});

	it("has no figure without an assignee, a start, or an omp agent", () => {
		expect(beadSpend(bead("a", { assignee: null }), spendOf, T0 + 3 * H)).toBeNull();
		expect(beadSpend(bead("a", { started_at: null }), spendOf, T0 + 3 * H)).toBeNull();
		expect(beadSpend(bead("a", { assignee: "ben" }), spendOf, T0 + 3 * H)).toBeNull();
	});
});

describe("withSpend", () => {
	it("prices in progress and done cards only, and totals each epic over its beads", () => {
		const beads = [
			bead("e", { issue_type: "epic", started_at: null }),
			bead("e.1", { parent: "e", closed_at: iso(T0 + 2 * H), status: "closed" }),
			bead("e.2", { parent: "e", assignee: "nora", started_at: iso(T0 + H) }),
			bead("e.3", { parent: "e", status: "open", started_at: null }),
		];
		const cards = withSpend(
			[card("e.1", "done"), card("e.2", "in_progress"), card("e.3", "ready")],
			beads,
			spendOf,
			T0 + 3 * H,
		);
		expect(cards.map((each) => [each.id, each.spend, each.epicSpend])).toEqual([
			["e.1", 2.25, { usd: 7.25, beads: 2 }],
			["e.2", 5, { usd: 7.25, beads: 2 }],
			["e.3", null, { usd: 7.25, beads: 2 }],
		]);
	});
});
