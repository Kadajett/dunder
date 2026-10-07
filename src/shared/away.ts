import type { Unsubscribe } from "./screens";

/** Away this long (window in the background, or the machine idle) earns a summary on return. */
export const AWAY_MS = 2 * 60 * 60 * 1000;

/** What happened while Jeremy was away; sections with nothing in them are left out by the card. */
export interface AwaySummary {
	/** Epoch ms he left, and came back. */
	readonly awayAt: number;
	readonly backAt: number;
	/** Beads closed since he left, newest first. */
	readonly closed: readonly { readonly id: string; readonly title: string }[];
	/** Agents' asks waiting for him now. */
	readonly asks: number;
	/** Commits the app rolled forward by (updates applied while he was away). */
	readonly updates: number;
	/** AI spend while he was away (USD); null when no agent's spend is known. */
	readonly spendUsd: number | null;
}

/** `window.office.away`: the "While you were away" card. */
export interface AwayApi {
	/** The summary waiting to be shown, if any (e.g. after a reload). */
	get(): Promise<AwaySummary | null>;
	/** He came back: a new summary to show. */
	onSummary(listener: (summary: AwaySummary) => void): Unsubscribe;
	dismiss(): Promise<void>;
}
