import type { DayPlan, PlanProposal } from "@shared/plan";
import type { WorkCard, WorkLane } from "@shared/work-board";

/** Jeremy's edits to a proposed plan: no adding beads (that's a chat with Max). */
export type PlanEdit =
	| { readonly kind: "remove"; readonly index: number }
	| { readonly kind: "move"; readonly index: number; readonly by: -1 | 1 }
	| { readonly kind: "assign"; readonly index: number; readonly who: string }
	| { readonly kind: "focus"; readonly text: string };

/** The plan with one edit applied; the same plan when the edit doesn't apply (out of range). */
export function applyPlanEdit(plan: PlanProposal, edit: PlanEdit): PlanProposal {
	switch (edit.kind) {
		case "focus":
			return { ...plan, focus: edit.text };
		case "remove":
			if (!plan.items[edit.index]) return plan;
			return { ...plan, items: plan.items.filter((_, index) => index !== edit.index) };
		case "assign": {
			const item = plan.items[edit.index];
			if (!item) return plan;
			return {
				...plan,
				items: plan.items.map((each, index) =>
					index === edit.index ? { ...item, who: edit.who } : each,
				),
			};
		}
		case "move": {
			const to = edit.index + edit.by;
			const item = plan.items[edit.index];
			const other = plan.items[to];
			if (!item || !other) return plan;
			const items = [...plan.items];
			items[to] = item;
			items[edit.index] = other;
			return { ...plan, items };
		}
	}
}

/** Whether an edited plan differs from the proposal (Save sends it only then). */
export function planChanged(edited: PlanProposal, proposal: PlanProposal): boolean {
	return JSON.stringify(edited) !== JSON.stringify(proposal);
}

/** Where a plan item's bead is now: its lane, done when it closed today, unknown when off the board. */
export type ItemLane = WorkLane | "unknown";

export function itemLane(
	bead: string,
	cards: readonly WorkCard[],
	closedToday: readonly string[],
): ItemLane {
	const card = cards.find((each) => each.id === bead);
	if (card) return card.lane;
	return closedToday.includes(bead) ? "done" : "unknown";
}

/** The card shows while the plan waits for Jeremy; the Today pill once it is decided. */
export const planCardDue = (plan: DayPlan | null): boolean => plan?.state === "proposed";
export const todayPillDue = (plan: DayPlan | null): boolean =>
	plan !== null && plan.state !== "proposed";
