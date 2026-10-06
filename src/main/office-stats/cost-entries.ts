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
