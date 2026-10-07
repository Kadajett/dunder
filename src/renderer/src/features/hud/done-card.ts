import type { WorkCard } from "@shared/work-board";

/** A bead closed this recently still names what a finished agent delivered. */
export const RECENT_DONE_MS = 24 * 60 * 60 * 1_000;
/** The reply's first lines on the card; 'more' opens it to `REPLY_MAX_LINES`. */
export const REPLY_PREVIEW_LINES = 3;
export const REPLY_MAX_LINES = 40;

const newestFirst = (a: WorkCard, b: WorkCard): number => b.updatedAt.localeCompare(a.updatedAt);

/**
 * The bead behind a finished agent's work: its In progress card, else the
 * card it closed most recently within the last 24 h; null without either.
 */
export function agentBead(cards: readonly WorkCard[], name: string, now: number): WorkCard | null {
	const own = cards.filter((card) => card.assignee === name);
	const working = own.filter((card) => card.lane === "in_progress").sort(newestFirst)[0];
	if (working) return working;
	const recent = own
		.filter((card) => card.lane === "done" && now - Date.parse(card.updatedAt) <= RECENT_DONE_MS)
		.sort(newestFirst)[0];
	return recent ?? null;
}

/** The reply as the card shows it: the first 3 lines, or up to 40 opened; and whether more is hidden. */
export function replyShown(
	text: string,
	open: boolean,
): { readonly text: string; readonly more: boolean; readonly cut: boolean } {
	const lines = text.split("\n");
	const limit = open ? REPLY_MAX_LINES : REPLY_PREVIEW_LINES;
	return {
		text: lines.slice(0, limit).join("\n"),
		more: !open && lines.length > REPLY_PREVIEW_LINES,
		cut: open && lines.length > REPLY_MAX_LINES,
	};
}
