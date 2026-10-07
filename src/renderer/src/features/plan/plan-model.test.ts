import type { DayPlan, PlanProposal } from "@shared/plan";
import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { applyPlanEdit, itemLane, planCardDue, planChanged, todayPillDue } from "./plan-model";

const proposal: PlanProposal = {
	focus: "Ship the morning plan",
	items: [
		{ bead: "office-4as.1", who: "carl", why: "the store" },
		{ bead: "office-4as.2", who: "theo", why: "the card" },
		{ bead: "office-x31", who: "mika", why: "shortcuts" },
	],
	notToday: ["pool polish"],
};
const beads = (plan: PlanProposal) => plan.items.map((item) => `${item.bead}:${item.who}`);

describe("applyPlanEdit", () => {
	it("removes, reorders and reassigns items, and rewords the focus", () => {
		expect(beads(applyPlanEdit(proposal, { kind: "remove", index: 1 }))).toEqual([
			"office-4as.1:carl",
			"office-x31:mika",
		]);
		expect(beads(applyPlanEdit(proposal, { kind: "move", index: 2, by: -1 }))).toEqual([
			"office-4as.1:carl",
			"office-x31:mika",
			"office-4as.2:theo",
		]);
		expect(beads(applyPlanEdit(proposal, { kind: "assign", index: 0, who: "ben" }))[0]).toBe(
			"office-4as.1:ben",
		);
		expect(applyPlanEdit(proposal, { kind: "focus", text: "Calls first" }).focus).toBe(
			"Calls first",
		);
	});

	it("leaves the plan as it is when an edit doesn't apply", () => {
		expect(applyPlanEdit(proposal, { kind: "move", index: 0, by: -1 })).toBe(proposal);
		expect(applyPlanEdit(proposal, { kind: "move", index: 2, by: 1 })).toBe(proposal);
		expect(applyPlanEdit(proposal, { kind: "remove", index: 9 })).toBe(proposal);
	});

	it("knows when an edit changed nothing", () => {
		const there = applyPlanEdit(proposal, { kind: "move", index: 0, by: 1 });
		expect(planChanged(there, proposal)).toBe(true);
		expect(planChanged(applyPlanEdit(there, { kind: "move", index: 1, by: -1 }), proposal)).toBe(
			false,
		);
	});
});

describe("itemLane", () => {
	const card = (id: string, lane: WorkCard["lane"]) => ({ id, lane }) as WorkCard;
	it("takes the card's live lane, done for a bead closed today off the board, else unknown", () => {
		const cards = [card("office-4as.1", "review"), card("office-4as.2", "in_progress")];
		expect(itemLane("office-4as.1", cards, [])).toBe("review");
		expect(itemLane("office-x31", cards, ["office-x31"])).toBe("done");
		expect(itemLane("office-zzz", cards, [])).toBe("unknown");
	});
});

describe("which surface shows", () => {
	const day = (state: DayPlan["state"]): DayPlan => ({
		date: "2026-10-08",
		state,
		proposal,
		plan: proposal,
		proposedAt: 0,
		proceedAt: 0,
		decidedAt: state === "proposed" ? null : 1,
	});
	it("shows the card while proposed, the Today pill once decided (auto included), nothing without a plan", () => {
		expect([planCardDue(day("proposed")), todayPillDue(day("proposed"))]).toEqual([true, false]);
		for (const state of ["approved", "edited", "auto"] as const)
			expect([planCardDue(day(state)), todayPillDue(day(state))]).toEqual([false, true]);
		expect([planCardDue(null), todayPillDue(null)]).toEqual([false, false]);
	});
});
