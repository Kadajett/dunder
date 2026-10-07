import { type DayPlan, planInEffect } from "@shared/plan";
import type { TryCounts } from "@shared/whats-new";
import type { WorkBoard } from "@shared/work-board";
import type { DayWrap, WrapPlanned } from "@shared/wrap";

/** What the app knows about the day, joined into Max's wrap-up. */
export interface DayFacts {
	readonly planned: readonly WrapPlanned[];
	readonly unplanned: readonly { readonly id: string; readonly title: string }[];
	readonly spendUsd: number | null;
	/** Today's 'Try these' and how Jeremy rated them; null when unknown. */
	readonly tries: TryCounts | null;
}

/**
 * The day against its plan: each planned item with where its bead is now
 * (done when it closed today, else its lane on the board, else null), and the
 * beads closed today that weren't planned.
 */
export function dayFacts(
	plan: DayPlan | null,
	board: WorkBoard,
	closedToday: readonly { readonly id: string; readonly title: string }[],
	extras: { readonly spendUsd: number | null; readonly tries: TryCounts | null },
): DayFacts {
	const items = plan ? planInEffect(plan).items : [];
	const cards = board.state === "ok" ? board.cards : [];
	const closed = new Map(closedToday.map((bead) => [bead.id, bead.title]));
	const planned = items.map((item): WrapPlanned => {
		const card = cards.find((candidate) => candidate.id === item.bead);
		const title = card?.title ?? closed.get(item.bead) ?? null;
		const lane = closed.has(item.bead) ? "done" : (card?.lane ?? null);
		return { bead: item.bead, who: item.who, title, lane };
	});
	const plannedIds = new Set(items.map((item) => item.bead));
	const unplanned = closedToday.filter((bead) => !plannedIds.has(bead.id));
	return { planned, unplanned, ...extras };
}

const laneWords: Readonly<Record<string, string>> = {
	done: "done",
	in_progress: "in progress",
	review: "in review",
	blocked: "blocked",
	ready: "not started",
};

/** The evening prompt: the day's facts, and what Max should write with `office-plan wrap`. */
export function eveningPrompt(facts: DayFacts): string {
	const planned =
		facts.planned.length === 0
			? "There was no plan today."
			: `Planned: ${facts.planned.map((item) => `${item.bead} (${item.who}) ${item.lane ? laneWords[item.lane] : "not on the board"}`).join("; ")}.`;
	const unplanned =
		facts.unplanned.length === 0
			? "Nothing shipped outside the plan."
			: `Shipped outside the plan: ${facts.unplanned.map((bead) => bead.id).join(", ")}.`;
	const spend = facts.spendUsd === null ? "" : ` AI spend today ~$${facts.spendUsd.toFixed(2)}.`;
	return [
		"[office] Evening wrap-up: close the day against this morning's plan with office-plan wrap.",
		`${planned} ${unplanned}${spend}${triesLine(facts.tries)}`,
		"Write a one- or two-sentence summary, why each unfinished planned item didn't land, and 1-3 proposals for tomorrow.",
	].join(" ");
}

/** ' Try these: 3 offered, 1 rated, 1 not tried.' (what reached Jeremy), or '' with none offered. */
export function triesLine(tries: TryCounts | null): string {
	if (!tries || tries.offered === 0) return "";
	return ` Try these today: ${tries.offered} offered, ${tries.rated} rated, ${tries.untried} not tried.`;
}

/** Added to the next morning's prompt: start from what the wrap-up proposed. */
export function morningContext(wrap: DayWrap | null): string {
	if (!wrap || wrap.input.tomorrow.length === 0) return "";
	const proposals = wrap.input.tomorrow
		.map((item, index) => `${index + 1}) ${item.bead ? `${item.bead}: ` : ""}${item.what}`)
		.join("; ");
	return ` Yesterday's wrap-up proposed for today: ${proposals}. Start from these.`;
}
