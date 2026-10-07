import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * The morning plan (epic office-4as): Max proposes the day with
 * `office-plan propose`, Jeremy approves or edits it (or Max goes ahead after
 * an hour), and new dispatches follow it for the rest of the day.
 */

export const PLAN_FOCUS_MAX = 140;
export const PLAN_ITEMS_MAX = 5;
export const PLAN_WHY_MAX = 120;
export const PLAN_NOT_TODAY_MAX = 5;
export const PLAN_NOT_TODAY_TEXT_MAX = 80;

/** One thing to build today: which bead, who builds it, and why it matters today. */
export const planItemSchema = z.strictObject({
	bead: z.string().trim().min(1).max(64),
	who: z.string().trim().min(1).max(32),
	why: z.string().trim().min(1).max(PLAN_WHY_MAX),
});
export type PlanItem = z.infer<typeof planItemSchema>;

/** What Max proposes (and what an edit saves): a focus, up to 5 items, and what is left out on purpose. */
export const planProposalSchema = z.strictObject({
	focus: z.string().trim().min(1).max(PLAN_FOCUS_MAX),
	items: z.array(planItemSchema).max(PLAN_ITEMS_MAX),
	notToday: z
		.array(z.string().trim().min(1).max(PLAN_NOT_TODAY_TEXT_MAX))
		.max(PLAN_NOT_TODAY_MAX)
		.default([]),
});
export type PlanProposal = z.output<typeof planProposalSchema>;

/**
 * `proposed`: waiting on Jeremy. `approved`: as proposed. `edited`: his edit
 * stands. `auto`: no decision within the hour, so Max went ahead as proposed.
 */
export type PlanState = "proposed" | "approved" | "edited" | "auto";

/** Today's plan as main keeps it (`<userData>/plans/<date>.json`). */
export interface DayPlan {
	/** Local `YYYY-MM-DD`. */
	readonly date: string;
	readonly proposal: PlanProposal;
	/** Epoch ms. */
	readonly proposedAt: number;
	readonly state: PlanState;
	/** Epoch ms of the decision (approve, edit or auto); null while proposed. */
	readonly decidedAt: number | null;
	/** Jeremy's edited plan; null unless state is `edited`. */
	readonly edited: PlanProposal | null;
	/**
	 * When Max goes ahead as proposed if Jeremy hasn't decided (epoch ms);
	 * null once decided, or while Jeremy is talking it over with Max.
	 */
	readonly goAheadAt: number | null;
}

/** The plan the office follows: Jeremy's edit when he made one, else the proposal. */
export function planInEffect(plan: DayPlan): PlanProposal {
	return plan.edited ?? plan.proposal;
}

export type PlanResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** `window.office.plan`. */
export interface PlanApi {
	/** Today's plan, or null when Max hasn't proposed one today. */
	today(): Promise<DayPlan | null>;
	onChanged(listener: (plan: DayPlan | null) => void): Unsubscribe;
	/** Approve the proposal as it is; Max hears '[plan approved] go ahead'. */
	approve(): Promise<PlanResult>;
	/** Replace the plan with Jeremy's edit; Max hears what changed. */
	edit(plan: PlanProposal): Promise<PlanResult>;
	/** Jeremy wants to talk it over first: Max doesn't go ahead on his own while they do. */
	discuss(): Promise<PlanResult>;
}
