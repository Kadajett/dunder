import { z } from "zod";
import { workIdSchema } from "./work-board";

/** Rows shown before the rest fold under "more". */
export const WHATS_NEW_ROWS = 8;
/** Commits listed when the last seen build is not an ancestor (history rewritten). */
export const WHATS_NEW_RECENT = 20;
export const WHATS_NEW_FEEDBACK_MAX = 500;

export type WhatsNewRating = "up" | "down";

/** One bead merged since the last build Jeremy dismissed. */
export interface WhatsNewBead {
	readonly id: string;
	/** Null when bd couldn't be read; the row shows `subject` instead. */
	readonly title: string | null;
	/** The commit subject that named the bead, for when there is no title. */
	readonly subject: string;
	/** The last `Try it:` line of the bead's notes (without the prefix), if any. */
	readonly tryIt: string | null;
	readonly rating: WhatsNewRating | null;
}

/** The card after an update; main sends null when there is nothing to show. */
export interface WhatsNew {
	/** The running build's commit. */
	readonly built: string;
	/** The last seen build isn't in this build's history: only recent commits are listed. */
	readonly recent: boolean;
	/** Newest first. */
	readonly beads: readonly WhatsNewBead[];
	/** Subjects of commits without a bead id. */
	readonly others: readonly string[];
	/** Why rating is off (bd unavailable); null when it works. */
	readonly ratingOff: string | null;
}

export type WhatsNewResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

export const whatsNewRateSchema = z.object({
	id: workIdSchema,
	rating: z.enum(["up", "down"]),
	/** What's off, for a thumbs down; optional. */
	text: z.string().trim().max(WHATS_NEW_FEEDBACK_MAX).default(""),
});
export type WhatsNewRate = z.input<typeof whatsNewRateSchema>;

/** `window.office.whatsNew`: the card shown after Dunder relaunches on a new commit. */
export interface WhatsNewApi {
	get(): Promise<WhatsNew | null>;
	rate(request: WhatsNewRate): Promise<WhatsNewResult>;
	/** "Got it": never show this build's card again. */
	dismiss(): Promise<void>;
}
