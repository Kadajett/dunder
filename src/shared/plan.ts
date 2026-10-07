import { z } from "zod";
import type { Unsubscribe } from "./screens";
import { workIdSchema } from "./work-board";

/**
 * The morning plan (epic office-4as): Max proposes the day, Jeremy approves,
 * edits or talks it through, and new dispatches follow the decided plan.
 * Main (office-4as.1) owns the schedule, the store and the `office-plan` CLI;
 * the renderer (office-4as.2) shows the card and the work bar's Today pill.
 */

export const PLAN_FOCUS_MAX = 140;
export const PLAN_ITEMS_MAX = 5;
export const PLAN_WHY_MAX = 120;
export const PLAN_NOT_TODAY_MAX = 5;
export const PLAN_NOT_TODAY_TEXT_MAX = 80;

export const planItemSchema = z.strictObject({
	/** The bead to work on today. */
	bead: workIdSchema,
	/** Who does it: an agent's name. */
	who: z.string().trim().min(1).max(64),
	/** One line: why it is on today's plan. */
	why: z.string().trim().min(1).max(PLAN_WHY_MAX),
});
export type PlanItem = z.infer<typeof planItemSchema>;

/** What Max proposes (`office-plan propose` on stdin), and what Jeremy's edit sends back. */
export const planProposalSchema = z.strictObject({
	/** One sentence: what today is for. */
	focus: z.string().trim().min(1).max(PLAN_FOCUS_MAX),
	/** In order of priority. */
	items: z.array(planItemSchema).max(PLAN_ITEMS_MAX),
	/** What is deliberately left out today. */
	notToday: z.array(z.string().trim().min(1).max(PLAN_NOT_TODAY_TEXT_MAX)).max(PLAN_NOT_TODAY_MAX),
});
export type PlanProposal = z.infer<typeof planProposalSchema>;

/**
 * `proposed`: waiting for Jeremy. `approved` / `edited`: he decided.
 * `auto`: no reply by `proceedAt`, so Max went ahead with the proposal.
 */
export type PlanState = "proposed" | "approved" | "edited" | "auto";

/** Today's plan as main stores it (`<userData>/plans/<date>.json`). */
export interface DayPlan {
	/** Local calendar day, `YYYY-MM-DD`. */
	readonly date: string;
	readonly state: PlanState;
	/** What Max proposed. */
	readonly proposal: PlanProposal;
	/** What the office follows: Jeremy's edit when `edited`, else the proposal. */
	readonly plan: PlanProposal;
	/** Epoch ms. */
	readonly proposedAt: number;
	/** When Max goes ahead without a reply (epoch ms). */
	readonly proceedAt: number;
	/** When it was approved, edited or went ahead (epoch ms); null while proposed. */
	readonly decidedAt: number | null;
}

export type PlanResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** `window.office.plan`. Every decision is also told to Max in the chief chat. */
export interface PlanApi {
	/** Today's plan; null when Max hasn't proposed one today. */
	today(): Promise<DayPlan | null>;
	/** Every change to today's plan (proposed, decided, or the day rolling over to none). */
	onChanged(listener: (plan: DayPlan | null) => void): Unsubscribe;
	approve(): Promise<PlanResult>;
	/** Jeremy's edit (items removed, reordered or reassigned, focus reworded); `planProposalSchema` applies. */
	edit(plan: PlanProposal): Promise<PlanResult>;
	/** Jeremy wants to talk it through in the chat: Max is told, and doesn't go ahead while they talk. */
	discuss(): Promise<PlanResult>;
}
