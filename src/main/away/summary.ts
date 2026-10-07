import { AWAY_MS, type AwaySummary } from "@shared/away";

/** Jeremy's absence as tracked: when it began, and the build that was running then. */
export interface Absence {
	readonly awayAt: number;
	/** The running build's commit when he left; null under the dev server. */
	readonly build: string | null;
}

/**
 * When an absence began, if one has: the window losing focus, or (with the
 * window focused) the machine idle for at least AWAY_MS. An absence already
 * under way is kept.
 */
export function absenceStart(
	current: Absence | null,
	signal: { readonly focused: boolean; readonly idleMs: number; readonly now: number },
): number | null {
	if (current) return current.awayAt;
	if (!signal.focused) return signal.now;
	return signal.idleMs >= AWAY_MS ? signal.now - signal.idleMs : null;
}

/** He is back: the window has focus and the machine isn't idle (input within the last minute). */
export function isBack(signal: { readonly focused: boolean; readonly idleMs: number }): boolean {
	return signal.focused && signal.idleMs < 60_000;
}

export interface AwayFacts {
	readonly closed: AwaySummary["closed"];
	readonly asks: number;
	readonly updates: number;
	readonly spendUsd: number | null;
}

/** The summary for an absence that just ended; null when it was short or nothing happened. */
export function awaySummary(awayAt: number, backAt: number, facts: AwayFacts): AwaySummary | null {
	if (backAt - awayAt < AWAY_MS) return null;
	const spendUsd =
		facts.spendUsd !== null && facts.spendUsd >= 0.005
			? Math.round(facts.spendUsd * 100) / 100
			: null;
	const empty =
		facts.closed.length === 0 && facts.asks === 0 && facts.updates === 0 && spendUsd === null;
	return empty ? null : { awayAt, backAt, ...facts, spendUsd };
}
