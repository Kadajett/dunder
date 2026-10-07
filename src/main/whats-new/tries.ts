import {
	DAY_END_TRIES,
	type TryCounts,
	type TryRating,
	type TryToRate,
	type WhatsNewBead,
} from "@shared/whats-new";
import { z } from "zod";
import { localDateKey } from "../calisthenics/schedule";

/** Days of 'Try these' kept; older ones are pruned. */
const KEEP_DAYS = 14;

const offeredSchema = z.object({
	title: z.string(),
	tryIt: z.string(),
	/** When it was first offered (epoch ms): Day's end lists the newest first. */
	at: z.number(),
	rating: z.enum(["up", "down", "untried"]).nullable(),
});
export type Offered = z.infer<typeof offeredSchema>;

/** Per local day (`YYYY-MM-DD`), the beads offered as 'Try these' on any card that day. */
export const triedSchema = z.record(z.string(), z.record(z.string(), offeredSchema));
export type Tried = z.infer<typeof triedSchema>;

/** `day` minus `days`, as a `YYYY-MM-DD` key (string compare orders days). */
function daysBefore(day: string, days: number): string {
	const date = new Date(`${day}T12:00:00`);
	date.setDate(date.getDate() - days);
	return localDateKey(date);
}

/**
 * Add a card's 'Try these' to `day` (a bead already there keeps its rating
 * and first-offered time), and drop days older than `KEEP_DAYS`.
 */
export function noteOffered(
	tried: Tried,
	day: string,
	beads: readonly WhatsNewBead[],
	now: number,
): Tried {
	const oldest = daysBefore(day, KEEP_DAYS - 1);
	const kept: Record<string, Record<string, Offered>> = Object.fromEntries(
		Object.entries(tried).filter(([key]) => key >= oldest),
	);
	const today = { ...(kept[day] ?? {}) };
	for (const bead of beads) {
		if (today[bead.id] || !bead.tryIt) continue;
		today[bead.id] = {
			title: bead.title ?? bead.subject,
			tryIt: bead.tryIt,
			at: now,
			rating: bead.rating,
		};
	}
	return { ...kept, [day]: today };
}

/** The same days with `id` rated wherever it was offered (a bead rated once counts as rated). */
export function withTryRating(tried: Tried, id: string, rating: TryRating): Tried {
	return Object.fromEntries(
		Object.entries(tried).map(([day, beads]) => {
			const offered = beads[id];
			return [day, offered ? { ...beads, [id]: { ...offered, rating } } : beads];
		}),
	);
}

/** Today's offered beads still unrated, newest first, at most `DAY_END_TRIES`. */
export function unratedToday(tried: Tried, day: string): TryToRate[] {
	return Object.entries(tried[day] ?? {})
		.filter(([, offered]) => offered.rating === null)
		.sort(([, a], [, b]) => b.at - a.at)
		.slice(0, DAY_END_TRIES)
		.map(([id, offered]) => ({ id, title: offered.title, tryIt: offered.tryIt }));
}

/** Today's 'Try these' in numbers. */
export function tryCounts(tried: Tried, day: string): TryCounts {
	const offered = Object.values(tried[day] ?? {});
	return {
		offered: offered.length,
		rated: offered.filter((each) => each.rating === "up" || each.rating === "down").length,
		untried: offered.filter((each) => each.rating === "untried").length,
	};
}
