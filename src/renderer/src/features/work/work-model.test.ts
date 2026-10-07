import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { applyEdit, groupByLane, pillText, shortId } from "./work-model";

const AT = "2026-10-06T12:00:00.000Z";

function card(id: string, lane: WorkCard["lane"], priority: WorkCard["priority"] = 2): WorkCard {
	return {
		id,
		title: `Title ${id}`,
		priority,
		lane,
		assignee: null,
		epic: null,
		waitingOn: [],
		description: "",
		acceptance: "",
		updatedAt: "2026-10-01T00:00:00.000Z",
		spend: null,
		epicSpend: null,
	};
}

const ids = (cards: readonly WorkCard[]) => cards.map((each) => each.id);
const lane = (cards: readonly WorkCard[], name: WorkCard["lane"]) =>
	ids(groupByLane(cards).find((group) => group.lane === name)?.cards ?? []);

describe("groupByLane", () => {
	it("returns every lane top to bottom, keeping the given order within each", () => {
		const cards = [
			card("o-3", "ready", 1),
			card("o-1", "done"),
			card("o-2", "ready", 3),
			card("o-4", "in_progress"),
		];
		const groups = groupByLane(cards);
		expect(groups.map((group) => group.lane)).toEqual(["in_progress", "blocked", "ready", "done"]);
		expect(groups.map((group) => ids(group.cards))).toEqual([["o-4"], [], ["o-3", "o-2"], ["o-1"]]);
	});
});

describe("pillText", () => {
	it("counts in progress, and blocked only when something is", () => {
		const cards = [
			card("a-1", "in_progress"),
			card("a-2", "in_progress"),
			card("a-3", "in_progress"),
			card("a-4", "blocked"),
			card("a-5", "ready"),
		];
		expect(pillText(cards)).toBe("Work · 3 in progress · 1 blocked");
		expect(pillText([card("a-5", "ready")])).toBe("Work · 0 in progress");
		expect(pillText(undefined)).toBe("Work");
	});
});

describe("shortId", () => {
	it("drops the repo prefix but keeps child numbers", () => {
		expect(shortId("office-344.2")).toBe("344.2");
		expect(shortId("herdr-office-hgr.4.1")).toBe("hgr.4.1");
		expect(shortId("plain")).toBe("plain");
	});
});

describe("applyEdit", () => {
	const board = [
		card("w-1", "in_progress", 1),
		card("r-1", "ready", 0),
		card("r-2", "ready", 2),
		card("r-3", "ready", 3),
		card("d-1", "done", 2),
	];

	it("moves a card into its new lane ahead of same-or-lower priority cards", () => {
		const next = applyEdit(board, { kind: "move", id: "d-1", lane: "ready", at: AT });
		expect(lane(next, "ready")).toEqual(["r-1", "d-1", "r-2", "r-3"]);
		expect(lane(next, "done")).toEqual([]);
		expect(next.find((each) => each.id === "d-1")?.updatedAt).toBe(AT);
	});

	it("moves to the end of a lane when everything there outranks it", () => {
		const next = applyEdit(board, { kind: "move", id: "r-3", lane: "in_progress", at: AT });
		expect(lane(next, "in_progress")).toEqual(["w-1", "r-3"]);
	});

	it("clears 'waiting on' when a card leaves Blocked", () => {
		const blocked = { ...card("b-1", "blocked"), waitingOn: ["r-1"] };
		const next = applyEdit([blocked], { kind: "move", id: "b-1", lane: "ready", at: AT });
		expect(next[0]?.waitingOn).toEqual([]);
	});

	it("re-sorts a card within its lane after a priority change", () => {
		const next = applyEdit(board, { kind: "priority", id: "r-3", priority: 1, at: AT });
		expect(lane(next, "ready")).toEqual(["r-1", "r-3", "r-2"]);
		expect(next.find((each) => each.id === "r-3")?.priority).toBe(1);
		const raised = applyEdit(board, { kind: "priority", id: "r-3", priority: 0, at: AT });
		expect(lane(raised, "ready")).toEqual(["r-3", "r-1", "r-2"]);
	});

	it("sets and clears the assignee", () => {
		const assigned = applyEdit(board, { kind: "assign", id: "r-2", assignee: "ava", at: AT });
		expect(assigned.find((each) => each.id === "r-2")?.assignee).toBe("ava");
		const cleared = applyEdit(assigned, { kind: "assign", id: "r-2", assignee: null, at: AT });
		expect(cleared.find((each) => each.id === "r-2")?.assignee).toBeNull();
	});

	it("is a no-op for unknown ids and for edits that change nothing", () => {
		expect(applyEdit(board, { kind: "move", id: "nope-1", lane: "done", at: AT })).toBe(board);
		expect(applyEdit(board, { kind: "priority", id: "nope-1", priority: 0, at: AT })).toBe(board);
		expect(applyEdit(board, { kind: "assign", id: "nope-1", assignee: "ava", at: AT })).toBe(board);
		expect(applyEdit(board, { kind: "move", id: "r-1", lane: "ready", at: AT })).toBe(board);
		expect(applyEdit(board, { kind: "priority", id: "r-2", priority: 2, at: AT })).toBe(board);
	});
});
