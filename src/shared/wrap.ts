import { z } from "zod";
import type { Unsubscribe } from "./screens";
import type { TryCounts } from "./whats-new";
import { type WorkLane, workIdSchema } from "./work-board";

/**
 * The evening wrap-up (office-1zq): at the evening time Max closes the day
 * against the morning plan with `office-plan wrap`; the app joins in the
 * facts (planned items' lanes, what shipped outside the plan, the day's
 * spend), Jeremy reads it as the 'Day's end' notice, and the next morning's
 * plan starts from its proposals.
 */

export const WRAP_SUMMARY_MAX = 200;
export const WRAP_WHY_MAX = 120;

/** What Max writes: the day in a sentence or two, why planned work didn't land, and 1-3 proposals. */
export const wrapInputSchema = z.strictObject({
	summary: z.string().trim().min(1).max(WRAP_SUMMARY_MAX),
	misses: z
		.array(z.strictObject({ bead: workIdSchema, why: z.string().trim().min(1).max(WRAP_WHY_MAX) }))
		.max(5)
		.default([]),
	tomorrow: z
		.array(
			z.strictObject({
				bead: workIdSchema.optional(),
				what: z.string().trim().min(1).max(WRAP_WHY_MAX),
			}),
		)
		.min(1)
		.max(3),
});
export type WrapInput = z.output<typeof wrapInputSchema>;

/** A planned item at the day's end: where its bead is now (null: not on the board any more). */
export interface WrapPlanned {
	readonly bead: string;
	readonly who: string;
	readonly title: string | null;
	readonly lane: WorkLane | null;
}

/** The day's wrap-up as main keeps it (`<userData>/plans/<date>-wrap.json`). */
export interface DayWrap {
	/** Local `YYYY-MM-DD`. */
	readonly date: string;
	/** Epoch ms. */
	readonly postedAt: number;
	readonly input: WrapInput;
	/** The plan in effect's items with their final lanes; empty on a day without a plan. */
	readonly planned: readonly WrapPlanned[];
	/** Beads closed today that weren't in the plan. */
	readonly unplanned: readonly { readonly id: string; readonly title: string }[];
	/** The office's AI spend today (USD); null when unknown. */
	readonly spendUsd: number | null;
	/** Today's 'Try these': offered, rated 👍/👎, marked 'didn't try'; null when unknown. */
	readonly tries: TryCounts | null;
	/** Jeremy closed the notice. */
	readonly dismissed: boolean;
}

/** `window.office.wrap`. */
export interface WrapApi {
	/** Today's wrap-up, or null before Max has written it. */
	today(): Promise<DayWrap | null>;
	onChanged(listener: (wrap: DayWrap | null) => void): Unsubscribe;
	/** Close the 'Day's end' notice (it stays readable with `office-plan show`). */
	dismiss(): Promise<void>;
}
