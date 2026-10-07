import type { WorkCard, WorkLane } from "@shared/work-board";
import { type Bead, isEpic } from "./cards";

/** An agent's AI spend (USD) between two instants; null when it has no tracked omp session. */
export type SpendOf = (agent: string, from: number, to: number) => number | null;

/** Lanes whose cards carry a figure: work under way or finished. */
const PRICED: ReadonlySet<WorkLane> = new Set(["in_progress", "done"]);

const cents = (usd: number): number => Math.round(usd * 100) / 100;

/**
 * Approximately what a bead cost: its assignee's spend from `started_at` to
 * `closed_at` (or `now`). Null without an assignee, a start, or an omp agent.
 */
export function beadSpend(bead: Bead, spendOf: SpendOf, now: number): number | null {
	if (!bead.assignee || !bead.started_at) return null;
	const from = Date.parse(bead.started_at);
	const to = bead.closed_at ? Date.parse(bead.closed_at) : now;
	if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
	const usd = spendOf(bead.assignee, from, to);
	return usd === null ? null : cents(usd);
}

/** Per epic id, the priced spend of its beads among `beads`. */
function epicTotals(
	beads: readonly Bead[],
	spendOf: SpendOf,
	now: number,
): Map<string, { usd: number; beads: number }> {
	const totals = new Map<string, { usd: number; beads: number }>();
	for (const bead of beads) {
		if (!bead.parent || isEpic(bead)) continue;
		const usd = beadSpend(bead, spendOf, now);
		if (usd === null) continue;
		const total = totals.get(bead.parent) ?? { usd: 0, beads: 0 };
		totals.set(bead.parent, { usd: cents(total.usd + usd), beads: total.beads + 1 });
	}
	return totals;
}

/**
 * Price the board's cards: in progress and done cards get their bead's
 * spend, and every card with an epic gets the epic's total over `beads`.
 */
export function withSpend(
	cards: readonly WorkCard[],
	beads: readonly Bead[],
	spendOf: SpendOf,
	now: number,
): WorkCard[] {
	const byId = new Map(beads.map((bead) => [bead.id, bead]));
	const epics = epicTotals(beads, spendOf, now);
	return cards.map((card) => {
		const bead = byId.get(card.id);
		const spend = bead && PRICED.has(card.lane) ? beadSpend(bead, spendOf, now) : null;
		const epicSpend = (bead?.parent && epics.get(bead.parent)) || null;
		return { ...card, spend, epicSpend };
	});
}
