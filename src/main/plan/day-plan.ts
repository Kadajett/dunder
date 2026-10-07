import { type DayPlan, type PlanProposal, planInEffect } from "@shared/plan";
import { planDiff } from "./diff";

/** A plan change, and what Max is told about it (null: nothing to tell). */
export type PlanStep =
	| { readonly ok: true; readonly plan: DayPlan; readonly tell: string | null }
	| { readonly ok: false; readonly error: string };

/** Max proposes (or re-proposes) today's plan: Jeremy has `proceedAfterMinutes` to decide. */
export function proposePlan(
	date: string,
	proposal: PlanProposal,
	now: number,
	proceedAfterMinutes: number,
): DayPlan {
	return {
		date,
		proposal,
		proposedAt: now,
		state: "proposed",
		decidedAt: null,
		edited: null,
		goAheadAt: now + proceedAfterMinutes * 60_000,
	};
}

const decided = (plan: DayPlan): string => `today's plan is already ${plan.state}`;

export function approvePlan(plan: DayPlan, now: number): PlanStep {
	if (plan.state !== "proposed") return { ok: false, error: decided(plan) };
	return {
		ok: true,
		plan: { ...plan, state: "approved", decidedAt: now, goAheadAt: null },
		tell: "[plan approved] go ahead",
	};
}

/** Jeremy's edit, from the proposal or (later in the day) from the plan in effect. */
export function editPlan(plan: DayPlan, edit: PlanProposal, now: number): PlanStep {
	const changes = planDiff(planInEffect(plan), edit);
	if (changes.length === 0 && plan.state !== "proposed")
		return { ok: false, error: "nothing changed" };
	const tell =
		changes.length === 0
			? "[plan edited] no changes: go ahead as proposed"
			: `[plan edited] ${changes.join("; ")}`;
	return {
		ok: true,
		plan: { ...plan, state: "edited", decidedAt: now, edited: edit, goAheadAt: null },
		tell,
	};
}

/** Jeremy wants to talk it over: Max hears so, and doesn't go ahead on his own meanwhile. */
export function discussPlan(plan: DayPlan): PlanStep {
	if (plan.state !== "proposed") return { ok: false, error: decided(plan) };
	return {
		ok: true,
		plan: { ...plan, goAheadAt: null },
		tell: "[plan: Jeremy wants to talk it over] hold the plan until you two agree; don't go ahead on your own",
	};
}

/** No decision by `goAheadAt`: Max goes ahead as proposed. Unchanged otherwise. */
export function goAheadIfDue(
	plan: DayPlan,
	now: number,
	proceedAfterMinutes: number,
): PlanStep | null {
	if (plan.state !== "proposed" || plan.goAheadAt === null || plan.goAheadAt > now) return null;
	return {
		ok: true,
		plan: { ...plan, state: "auto", decidedAt: now, goAheadAt: null },
		tell: `[plan: no reply from Jeremy after ${proceedAfterMinutes} min] go ahead as proposed`,
	};
}

/** The morning prompt to Max. */
export const MORNING_PROMPT =
	"[office] Morning plan: propose today's plan with office-plan propose. Read bd ready, the Review lane, asks waiting on Jeremy, and yesterday's What's new 👎. One focus sentence, at most 5 items, and a not-today list.";
