import type { Snooze, SnoozeChoice } from "@shared/inbox-snooze";

const HOUR_MS = 60 * 60 * 1000;
/** 'Tomorrow 9:00' picked before this hour means this morning's 9:00: he hasn't slept yet. */
const NIGHT_ENDS_HOUR = 5;
const MORNING_HOUR = 9;

/**
 * When a snooze picked at `now` ends. 'morning' is 9:00 local on the next
 * day, or today's 9:00 when picked between midnight and 5:00.
 */
export function snoozeUntil(choice: SnoozeChoice, now: number): number {
	if (choice === "1h") return now + HOUR_MS;
	if (choice === "4h") return now + 4 * HOUR_MS;
	const morning = new Date(now);
	if (morning.getHours() >= NIGHT_ENDS_HOUR) morning.setDate(morning.getDate() + 1);
	morning.setHours(MORNING_HOUR, 0, 0, 0);
	return morning.getTime();
}

/** One snooze per key: a new one for the same item replaces it. */
export function withSnooze(snoozes: readonly Snooze[], snooze: Snooze): Snooze[] {
	return [...snoozes.filter((existing) => existing.key !== snooze.key), snooze];
}

/** What is live right now; null for a kind not known yet (nothing of it is dropped). */
export interface LiveItems {
	readonly blocked: ReadonlySet<string> | null;
	readonly asks: ReadonlySet<string> | null;
}

function isLive(key: string, live: LiveItems): boolean {
	const at = key.indexOf(":");
	const kind = key.slice(0, at);
	const id = key.slice(at + 1);
	const set = kind === "ask" ? live.asks : live.blocked;
	return set === null || set.has(id);
}

/**
 * Sort snoozes against the clock and what is live: `kept` still run; `due`
 * ended and their item is still there (it comes back as new and may alert);
 * the rest are gone (the agent unblocked, the ask closed) and simply drop.
 */
export function sortSnoozes(
	snoozes: readonly Snooze[],
	live: LiveItems,
	now: number,
): { readonly kept: Snooze[]; readonly due: Snooze[] } {
	const present = snoozes.filter((snooze) => isLive(snooze.key, live));
	return {
		kept: present.filter((snooze) => snooze.until > now),
		due: present.filter((snooze) => snooze.until <= now),
	};
}
