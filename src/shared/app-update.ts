import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * Stable mode: Jeremy's app runs a production build and only rolls forward
 * when someone asks — from the HUD, or an agent running `office-update`.
 */

export interface UpdateCommit {
	readonly sha: string;
	readonly subject: string;
}

/** An agent asked for the app to roll forward; it applies at `applyAt` unless Jeremy cancels. */
export interface UpdateCountdown {
	/** Agent name, or "someone" when the request came from outside an agent pane. */
	readonly by: string;
	readonly reason: string;
	/** Epoch milliseconds. */
	readonly applyAt: number;
	/** More requests folded into this one (shown as "theo + 2 more"). */
	readonly extra: number;
}

/**
 * Agents asked for an update while Jeremy was busy: it waits, and the normal
 * countdown starts once he has been free for `UPDATE_FREE_MS`.
 */
export interface UpdateHeld {
	/** The latest requester, and its reason. */
	readonly by: string;
	readonly reason: string;
	/** Earlier requests folded in. */
	readonly extra: number;
	/** What he is doing ("in a terminal"), or null once he is free. */
	readonly busy: string | null;
	/** When the countdown starts (epoch ms); set only while he is free. */
	readonly startsAt: number | null;
}

/**
 * Agents asked for an update soon after the last one applied: it waits for
 * the batch window to end, then runs the normal flow (held while Jeremy is
 * busy, then the countdown) once for every request folded in.
 */
export interface UpdateBatched {
	/** The latest requester, and its reason. */
	readonly by: string;
	readonly reason: string;
	/** Earlier requests folded in. */
	readonly extra: number;
	/** When the window ends (epoch ms). */
	readonly nextAt: number;
}

interface Behind {
	/** The checkout's HEAD, which a rebuild would run. */
	readonly head: string;
	/** Newest first, capped at `MAX_LISTED_COMMITS`. */
	readonly commits: readonly UpdateCommit[];
	/** Commits between the running build and HEAD (0 when HEAD moved sideways or back). */
	readonly behind: number;
	/** At most one of `countdown`, `held` and `batched` is set. */
	readonly countdown?: UpdateCountdown;
	readonly held?: UpdateHeld;
	readonly batched?: UpdateBatched;
	/**
	 * Jeremy rolled back from `from` (a build he chose to leave): it shows as
	 * 'you rolled back from', and agents' update requests never count down,
	 * even after `newer` commits land on top of it (one may still carry the
	 * break). Only his own Update clears it.
	 */
	readonly rolledBack?: { readonly from: string; readonly newer: number };
}

export type UpdateStatus =
	/** Running under the dev server (or a build without git identity): nothing to update. */
	| { readonly state: "dev" }
	/** The running build is HEAD. */
	| { readonly state: "idle"; readonly head: string }
	| ({ readonly state: "available" } & Behind)
	| { readonly state: "building"; readonly logTail: string }
	/** The last build failed; the old build keeps running. */
	| ({ readonly state: "failed"; readonly error: string; readonly logTail: string } & Behind);

/** A status an update can be applied from. */
export type ApplicableStatus = Extract<UpdateStatus, { state: "available" | "failed" }>;

export const MAX_LISTED_COMMITS = 20;
/** How long an agent-requested update waits for Jeremy to cancel it. */
export const UPDATE_COUNTDOWN_MS = 15_000;
/** Requests older than this (e.g. made while the app was closed) are ignored. */
export const UPDATE_REQUEST_MAX_AGE_MS = 10 * 60 * 1000;
/** A held update's countdown starts after Jeremy has been free this long. */
export const UPDATE_FREE_MS = 10_000;
/** What Jeremy is doing that holds agents' updates; null when he is free. */
export const updateBusySchema = z.string().min(1).max(60).nullable();
/** Agents' updates apply at most this often by default (`<userData>/update-batching.json`; 0 turns batching off). */
export const UPDATE_BATCH_DEFAULT_MINUTES = 120;

/** One line of the update-requests file, appended by `office-update`. */
export const updateRequestLineSchema = z.strictObject({
	v: z.literal(1),
	id: z.string().min(8).max(64),
	/** herdr pane of the requester (`HERDR_PANE_ID`), mapped to its agent by the app. */
	fromPane: z.string().max(64).optional(),
	reason: z.string().max(500),
	/** `office-update --hotfix`: skips the batch window (the hold while Jeremy is busy and the countdown still apply). */
	hotfix: z.literal(true).optional(),
	requestedAt: z.iso.datetime(),
});
export type UpdateRequestLine = z.infer<typeof updateRequestLineSchema>;

/** The build the last update replaced, kept (one level deep) so Jeremy can go back to it. */
export interface PreviousBuild {
	readonly commit: string;
	readonly subject: string;
	/**
	 * package.json or its lock differ from the running build: the shared
	 * `node_modules` would not match the old build, so it can't be rolled back to.
	 */
	readonly dependenciesChanged: boolean;
}

export type RollbackResult = { readonly ok: true } | { readonly ok: false; readonly error: string };
/** The rollback confirm's optional 'What broke?' line. */
export const WHAT_BROKE_MAX = 200;

/** `window.office.update`. */
export interface AppUpdateApi {
	status(): Promise<UpdateStatus>;
	onStatus(listener: (status: UpdateStatus) => void): Unsubscribe;
	/** Rebuild and relaunch on HEAD; no-op unless an update is available or failed. */
	apply(reason?: string): Promise<void>;
	/** Cancel an agent-requested countdown, or skip a held update. */
	cancel(): Promise<void>;
	/** Jeremy is busy (why) or free (null); agents' updates wait while he is busy. */
	setBusy(busy: string | null): Promise<void>;
	/** The kept previous build, or null when there is none to go back to. */
	previous(): Promise<PreviousBuild | null>;
	/**
	 * Swap the previous build back in and relaunch on it, telling Max and the
	 * beads in between (with `whatBroke`, Jeremy's optional one line); resolves
	 * only on failure (or never, as the app quits).
	 */
	rollback(whatBroke?: string): Promise<RollbackResult>;
}
