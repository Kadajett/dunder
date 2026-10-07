import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import type { WorkEdit } from "./work-model";
import { editLabel, undoOf } from "./work-undo";

const card = (extra: Partial<WorkCard>): WorkCard =>
	({
		id: "office-67k",
		lane: "review",
		priority: 1,
		assignee: "theo",
		waitingOn: [],
		...extra,
	}) as WorkCard;
const at = "2026-10-07T00:00:00Z";

describe("undoOf", () => {
	it("moves a card back to the lane it left: Done → Review goes back to Review (the label comes back with it)", () => {
		const edit: WorkEdit = { kind: "move", id: "office-67k", lane: "done", at };
		expect(undoOf(card({ lane: "review" }), edit)).toEqual({
			kind: "move",
			id: "office-67k",
			lane: "review",
		});
		expect(editLabel(card({ lane: "review" }), edit)).toBe("Moved 67k to Done");
	});

	it("sends a card blocked only by its blockers back to Ready (status open), not to status blocked", () => {
		const edit: WorkEdit = { kind: "move", id: "office-67k", lane: "in_progress", at };
		expect(undoOf(card({ lane: "blocked", waitingOn: ["office-a"] }), edit)).toMatchObject({
			lane: "ready",
		});
		expect(undoOf(card({ lane: "blocked", waitingOn: [] }), edit)).toMatchObject({
			lane: "blocked",
		});
	});

	it("puts the old priority back", () => {
		const edit: WorkEdit = { kind: "priority", id: "office-67k", priority: 3, at };
		expect(undoOf(card({ priority: 1 }), edit)).toEqual({
			kind: "priority",
			id: "office-67k",
			priority: 1,
		});
		expect(editLabel(card({ priority: 1 }), edit)).toBe("P1 → P3 on 67k");
	});

	it("unassigned → theo, undone, is unassigned again", () => {
		const edit: WorkEdit = { kind: "assign", id: "office-67k", assignee: "theo", at };
		expect(undoOf(card({ assignee: null }), edit)).toEqual({
			kind: "assign",
			id: "office-67k",
			assignee: null,
		});
		expect(editLabel(card({ assignee: null }), edit)).toBe("unassigned → theo on 67k");
	});
});
