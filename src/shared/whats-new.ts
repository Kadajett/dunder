import { z } from "zod";
import { workIdSchema } from "./work-board";

/** Rows in 'Try these' (beads with a Try it line); the rest fold into 'Also changed'. */
export const WHATS_NEW_TRY_ROWS = 3;
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
	/** bd's issue_type (feature, bug, task, …); null when bd couldn't be read. */
	readonly type: string | null;
	/** Its commits touch only tooling, agent docs, tests or CI ('Under the hood'). */
	readonly internal: boolean;
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

/** Features before bugs before everything else. */
const TYPE_RANK: Readonly<Record<string, number>> = { feature: 0, bug: 1 };
const rank = (bead: WhatsNewBead): number => TYPE_RANK[bead.type ?? ""] ?? 2;

/**
 * 'Try these': at most `WHATS_NEW_TRY_ROWS` beads with a Try it line that
 * Jeremy can see, features first, newest first within a type. Main records
 * them as offered for the day; the card shows them on top.
 */
export function tryTheseOf(beads: readonly WhatsNewBead[]): WhatsNewBead[] {
	const candidates = beads.filter((bead) => bead.tryIt !== null && !bead.internal);
	// A stable sort keeps newest-first within each type.
	return [...candidates].sort((a, b) => rank(a) - rank(b)).slice(0, WHATS_NEW_TRY_ROWS);
}

/** How a 'Try these' change landed, asked at the day's end: 'untried' is an answer too. */
export type TryRating = WhatsNewRating | "untried";

/** A change offered as 'Try these' today that Jeremy hasn't rated yet. */
export interface TryToRate {
	readonly id: string;
	readonly title: string;
	readonly tryIt: string;
}

/** The day's 'Try these' in numbers: offered, rated 👍/👎, and marked 'didn't try'. */
export interface TryCounts {
	readonly offered: number;
	readonly rated: number;
	readonly untried: number;
}

/** Day's end asks about at most this many. */
export const DAY_END_TRIES = 3;

export const tryRateSchema = z.strictObject({
	id: workIdSchema,
	rating: z.enum(["up", "down", "untried"]),
});

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
	/** Today's 'Try these' still unrated, newest first (at most `DAY_END_TRIES`). */
	tries(): Promise<readonly TryToRate[]>;
	/** Rate one at the day's end: 👍/👎 as on the card (bd comment; 👎 tells Max), 'untried' kept locally. */
	rateTry(request: { readonly id: string; readonly rating: TryRating }): Promise<WhatsNewResult>;
}
