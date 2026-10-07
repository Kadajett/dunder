import { describe, expect, it } from "vitest";
import { type BdLists, type Bead, buildCards, epicTag, parseBeads } from "./cards";

function bead(id: string, fields: Partial<Bead> = {}): Bead {
	return {
		id,
		title: `title ${id}`,
		status: "open",
		priority: 2,
		issue_type: "task",
		updated_at: "2026-10-06T12:00:00Z",
		...fields,
	};
}

function lists(fields: Partial<BdLists>): BdLists {
	return { open: [], blocked: [], ready: [], closed: [], ...fields };
}

const build = (board: BdLists) => buildCards(board, 0);
const lanesOf = (board: BdLists) => build(board).map(({ id, lane }) => [id, lane]);

describe("parseBeads", () => {
	it("reads bd's list output, keeping only the fields the board needs", () => {
		const stdout = JSON.stringify([
			{
				id: "office-344.2",
				title: "Build the board",
				status: "open",
				priority: 1,
				issue_type: "feature",
				assignee: "theo",
				owner: "jeremy@example.com",
				parent: "office-344",
				updated_at: "2026-10-06T22:43:05Z",
				dependencies: [{ issue_id: "office-344.2", depends_on_id: "office-344.1", type: "blocks" }],
				comment_count: 0,
			},
		]);
		const [parsed] = parseBeads(stdout);
		expect(parsed).toMatchObject({ id: "office-344.2", assignee: "theo", parent: "office-344" });
		expect(parsed).not.toHaveProperty("owner");
	});

	it("treats null as no beads and rejects anything that is not a bead list", () => {
		expect(parseBeads("null")).toEqual([]);
		expect(() => parseBeads('[{"id":"a"}]')).toThrow();
		expect(() => parseBeads(JSON.stringify([{ ...bead("a"), priority: 7 }]))).toThrow();
		expect(() => parseBeads("Error: no beads database found")).toThrow();
	});
});

describe("buildCards lanes", () => {
	it("puts a bead in exactly one lane: in progress beats blocked beats ready", () => {
		const working = bead("a-1", { status: "in_progress" });
		const waiting = bead("a-2");
		const free = bead("a-3");
		const board = lists({
			open: [working, waiting, free],
			blocked: [
				{ ...working, blocked_by: ["a-9"] },
				{ ...waiting, blocked_by: ["a-1"] },
			],
			ready: [waiting, free],
		});
		expect(lanesOf(board)).toEqual([
			["a-1", "in_progress"],
			["a-2", "blocked"],
			["a-3", "ready"],
		]);
	});

	it("blocks an open bead with open blockers and says what it waits on", () => {
		const waiting = bead("a-2", { status: "open" });
		const [card] = build(
			lists({ open: [waiting], blocked: [{ ...waiting, blocked_by: ["a-1", "a-5"] }] }),
		);
		expect(card).toMatchObject({ lane: "blocked", waitingOn: ["a-1", "a-5"] });
	});

	it("waits a status-blocked bead on its still-open blockers when bd blocked skips it", () => {
		const stuck = bead("a-2", {
			status: "blocked",
			dependencies: [
				{ depends_on_id: "a-1", type: "blocks" },
				{ depends_on_id: "a-closed", type: "blocks" },
				{ depends_on_id: "a-epic", type: "parent-child" },
			],
		});
		const cards = build(lists({ open: [bead("a-1", { status: "in_progress" }), stuck] }));
		expect(cards.find((card) => card.id === "a-2")).toMatchObject({
			lane: "blocked",
			waitingOn: ["a-1"],
		});
	});

	it("never shows epics or beads missing from the open list (deferred)", () => {
		const epic = bead("a-e", { issue_type: "epic" });
		const deferred = bead("a-d", { status: "deferred" });
		const board = lists({
			open: [epic, bead("a-1")],
			ready: [epic, deferred, bead("a-1")],
			blocked: [{ ...deferred, blocked_by: ["a-1"] }],
			closed: [bead("a-e2", { issue_type: "epic", status: "closed" })],
		});
		expect(lanesOf(board)).toEqual([["a-1", "ready"]]);
	});

	it("keeps only the five most recently closed beads in Done", () => {
		const closed = [1, 2, 3, 4, 5, 6, 7].map((hour) =>
			bead(`a-${hour}`, { status: "closed", closed_at: `2026-10-06T0${hour}:00:00Z` }),
		);
		const done = build(lists({ closed })).map((card) => card.id);
		expect(done.sort()).toEqual(["a-3", "a-4", "a-5", "a-6", "a-7"]);
	});

	it("shows only beads closed since the Done window opened (older ones only count for epics)", () => {
		const closed = [
			bead("a-old", { status: "closed", closed_at: "2026-10-04T12:00:00Z" }),
			bead("a-new", { status: "closed", closed_at: "2026-10-06T08:00:00Z" }),
		];
		const since = Date.parse("2026-10-05T12:00:00Z");
		expect(buildCards(lists({ closed }), since).map((card) => card.id)).toEqual(["a-new"]);
	});
});

describe("buildCards order and fields", () => {
	it("orders by lane, then priority, then most recently updated", () => {
		const board = lists({
			open: [
				bead("a-old", { updated_at: "2026-10-06T01:00:00Z" }),
				bead("a-p0", { priority: 0, updated_at: "2026-10-05T01:00:00Z" }),
				bead("a-new", { updated_at: "2026-10-06T09:00:00Z" }),
				bead("a-wip", { status: "in_progress", priority: 4 }),
			],
			ready: [bead("a-old"), bead("a-p0"), bead("a-new")],
			closed: [bead("a-done", { status: "closed", priority: 0 })],
		});
		expect(build(board).map((card) => card.id)).toEqual([
			"a-wip",
			"a-p0",
			"a-new",
			"a-old",
			"a-done",
		]);
	});

	it("tags a child with its parent epic and fills the card from the open list", () => {
		const epic = bead("a-e", { issue_type: "epic", title: "[epic] Left bar becomes a work board" });
		const child = bead("a-e.1", {
			parent: "a-e",
			assignee: "theo",
			description: "what",
			acceptance_criteria: "done when",
		});
		// bd ready omits `parent`; the card must still carry the epic.
		const [card] = build(lists({ open: [epic, child], ready: [bead("a-e.1")] }));
		expect(card).toEqual({
			id: "a-e.1",
			title: "title a-e.1",
			priority: 2,
			lane: "ready",
			assignee: "theo",
			epic: "Left bar becomes a work…",
			waitingOn: [],
			description: "what",
			acceptance: "done when",
			updatedAt: "2026-10-06T12:00:00Z",
			spend: null,
			epicSpend: null,
		});
	});

	it("leaves epic null for a parent that is not an epic", () => {
		const [card] = build(
			lists({ open: [bead("a-1"), bead("a-1.1", { parent: "a-1", status: "in_progress" })] }),
		);
		expect(card).toMatchObject({ id: "a-1.1", epic: null, assignee: null });
	});
});

describe("epicTag", () => {
	it("strips a leading epic marker", () => {
		expect(epicTag("[epic] Pool table")).toBe("Pool table");
		expect(epicTag("(EPIC) Pool table")).toBe("Pool table");
		expect(epicTag("[Epic]: Pool table")).toBe("Pool table");
	});

	it("keeps short titles and cuts long ones to 24 chars with an ellipsis", () => {
		expect(epicTag("Exactly twenty-four char")).toBe("Exactly twenty-four char");
		const tag = epicTag("One-command install (npx + curl) with auto-deploy");
		expect(tag).toBe("One-command install (np…");
		expect(tag).toHaveLength(24);
	});
});
