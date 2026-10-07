import type { AgentSpend } from "@shared/office-stats";
import { z } from "zod";

/** One priced assistant turn from an omp session log. */
export interface CostEntry {
	/** Epoch milliseconds the turn was logged. */
	readonly at: number;
	/** US dollars (`message.usage.cost.total`). */
	readonly usd: number;
}

const pricedMessageSchema = z.object({
	type: z.literal("message"),
	timestamp: z.iso.datetime(),
	message: z.object({
		role: z.literal("assistant"),
		usage: z.object({ cost: z.object({ total: z.number().nonnegative() }) }),
	}),
});

/** Parse one session log line; anything but a priced assistant message is undefined. */
export function parseCostLine(line: string): CostEntry | undefined {
	// Cheap pre-filter: tool output lines can be megabytes and never carry a price.
	if (!line.includes('"usage"') || !line.includes('"assistant"')) return undefined;
	try {
		const parsed = pricedMessageSchema.safeParse(JSON.parse(line));
		if (!parsed.success) return undefined;
		return { at: Date.parse(parsed.data.timestamp), usd: parsed.data.message.usage.cost.total };
	} catch {
		return undefined;
	}
}

/** Local calendar day of an instant, `YYYY-MM-DD`. */
export function dayKey(at: number): string {
	const date = new Date(at);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

/** Add entries into per-day dollar totals (mutates and returns `totals`). */
export function addToDays(
	totals: Map<string, number>,
	entries: readonly CostEntry[],
): Map<string, number> {
	for (const entry of entries) {
		const key = dayKey(entry.at);
		totals.set(key, (totals.get(key) ?? 0) + entry.usd);
	}
	return totals;
}

/** Sum one day across every session's per-day totals. */
export function costOnDay(sessions: Iterable<ReadonlyMap<string, number>>, day: string): number {
	let usd = 0;
	for (const totals of sessions) usd += totals.get(day) ?? 0;
	return usd;
}

/** One session log's spend, as far as it has been read: per-day totals and the latest priced turns. */
export interface SessionSpend {
	/** The agent that last used this session (sessions outlive respawns). */
	readonly agent: string | undefined;
	readonly days: ReadonlyMap<string, number>;
	/** Turns inside the alarm window, oldest first (older ones are pruned). */
	readonly recent: readonly CostEntry[];
}

/** `recent` plus `entries`, keeping only turns since `since`. */
export function keepRecent(
	recent: readonly CostEntry[],
	entries: readonly CostEntry[],
	since: number,
): CostEntry[] {
	return [...recent, ...entries].filter((entry) => entry.at >= since);
}

/** Per agent, today's and the window's spend summed over its sessions, biggest spender today first. */
export function agentSpends(
	sessions: Iterable<SessionSpend>,
	day: string,
	since: number,
): AgentSpend[] {
	const byAgent = new Map<string, { usd: number; recentUsd: number }>();
	for (const session of sessions) {
		if (!session.agent) continue;
		const spend = byAgent.get(session.agent) ?? { usd: 0, recentUsd: 0 };
		spend.usd += session.days.get(day) ?? 0;
		for (const entry of session.recent) if (entry.at >= since) spend.recentUsd += entry.usd;
		byAgent.set(session.agent, spend);
	}
	return [...byAgent]
		.map(([name, spend]) => ({ name, ...spend }))
		.sort((a, b) => b.usd - a.usd || a.name.localeCompare(b.name));
}

/**
 * What `agent` spent between `from` and `to` (inclusive, epoch ms) over the
 * sessions credited to it; null when it has no session at all.
 */
export function spendInSpan(
	sessions: readonly { readonly agent: string | undefined; readonly all: readonly CostEntry[] }[],
	agent: string,
	from: number,
	to: number,
): number | null {
	const mine = sessions.filter((session) => session.agent === agent);
	if (mine.length === 0) return null;
	let usd = 0;
	for (const session of mine)
		for (const entry of session.all) if (entry.at >= from && entry.at <= to) usd += entry.usd;
	return usd;
}
