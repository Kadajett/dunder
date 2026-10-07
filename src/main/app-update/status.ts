import {
	type ApplicableStatus,
	MAX_LISTED_COMMITS,
	UPDATE_COUNTDOWN_MS,
	UPDATE_FREE_MS,
	type UpdateBatched,
	type UpdateCommit,
	type UpdateCountdown,
	type UpdateHeld,
	type UpdateStatus,
} from "@shared/app-update";

/** What the checkout looks like right now. */
export interface UpdateCheck {
	readonly head: string;
	/** Commits in `<built>..HEAD`, newest first. */
	readonly commits: readonly UpdateCommit[];
}

export function canApply(status: UpdateStatus): status is ApplicableStatus {
	return status.state === "available" || status.state === "failed";
}

/**
 * Fold a fresh check into the status. Checks never interrupt a build or the
 * dev server. While Jeremy's rollback pin (`rolledBackFrom`) holds, whatever
 * is offered is marked as rolled back (and how many commits landed on top of
 * the build he left), with no agent's countdown.
 */
export function afterCheck(
	current: UpdateStatus,
	built: string,
	check: UpdateCheck,
	rolledBackFrom?: string,
): UpdateStatus {
	if (current.state === "dev" || current.state === "building") return current;
	if (check.head === built) return { state: "idle", head: check.head };
	// The same HEAD that just failed to build: keep the failure (and its log) on screen.
	if (current.state === "failed" && current.head === check.head) return current;
	const behind = {
		head: check.head,
		commits: check.commits.slice(0, MAX_LISTED_COMMITS),
		behind: check.commits.length,
	};
	if (rolledBackFrom !== undefined) {
		const at = check.commits.findIndex((commit) => commit.sha === rolledBackFrom);
		// Not in built..HEAD (history rewritten under it): count everything as newer.
		const newer = at === -1 ? check.commits.length : at;
		return { state: "available", ...behind, rolledBack: { from: rolledBackFrom, newer } };
	}
	const plan = canApply(current) ? planOf(current) : {};
	return { state: "available", ...behind, ...plan };
}

/** An agent's request to roll forward, as the HUD names it. */
export interface UpdateRequest {
	readonly by: string;
	readonly reason: string;
	/** The batch window's end (epoch ms): the request waits for it. Absent with no window, or for a hotfix. */
	readonly batchUntil?: number;
	/** Earlier requests already folded into this one (a pending update restored after a restart). */
	readonly folded?: number;
}

/** The agents' update waiting on the status (batched, held or counting down), if any. */
export function waitingOf(
	status: UpdateStatus,
): Pick<UpdateCountdown, "by" | "reason" | "extra"> | undefined {
	if (!canApply(status)) return undefined;
	const waiting = status.batched ?? status.held ?? status.countdown;
	return waiting && { by: waiting.by, reason: waiting.reason, extra: waiting.extra };
}

type Plan =
	| { readonly countdown: UpdateCountdown }
	| { readonly held: UpdateHeld }
	| { readonly batched: UpdateBatched }
	| Record<never, never>;

function planOf(status: ApplicableStatus): Plan {
	if (status.countdown) return { countdown: status.countdown };
	if (status.held) return { held: status.held };
	if (status.batched) return { batched: status.batched };
	return {};
}

/** The same status, counting down, held, batched, or none of them (never two). */
function withPlan(status: ApplicableStatus, plan: Plan): ApplicableStatus {
	const { countdown: _countdown, held: _held, batched: _batched, ...rest } = status;
	return { ...rest, ...plan };
}

/** Start waiting for Jeremy: held while he is busy, else the countdown starts. */
const waitFor = (
	status: ApplicableStatus,
	{ by, reason, extra }: Pick<UpdateCountdown, "by" | "reason" | "extra">,
	busy: string | null,
	now: number,
): ApplicableStatus =>
	busy === null
		? withPlan(status, countdownOf({ by, reason, extra }, now))
		: withPlan(status, { held: { by, reason, extra, busy, startsAt: null } });

const countdownOf = (
	{ by, reason, extra }: Pick<UpdateCountdown, "by" | "reason" | "extra">,
	now: number,
) => ({
	countdown: { by, reason, extra, applyAt: now + UPDATE_COUNTDOWN_MS },
});

/**
 * A fresh agent request (only when there is something to apply). Inside the
 * batch window it waits for the window's end. Otherwise it is held while
 * Jeremy is busy, or the countdown starts (or restarts). A request on top of
 * a waiting one is folded in: the latest names it, the rest are counted, and
 * the update applies once.
 */
export function requestUpdate(
	current: UpdateStatus,
	{ by, reason, batchUntil, folded = 0 }: UpdateRequest,
	busy: string | null,
	now: number,
): UpdateStatus {
	// The build Jeremy rolled back from: only he can choose to go back to it.
	if (!canApply(current) || current.rolledBack) return current;
	const earlier = current.held ?? current.countdown ?? current.batched;
	const extra = (earlier ? earlier.extra + 1 : 0) + folded;
	const waiting = current.held ?? current.countdown;
	if (batchUntil !== undefined && now < batchUntil && !waiting)
		return withPlan(current, { batched: { by, reason, extra, nextAt: batchUntil } });
	// Already waiting out his free time: keep waiting, with the new request folded in.
	if (current.held && busy === null)
		return withPlan(current, { held: { ...current.held, by, reason, extra } });
	return waitFor(current, { by, reason, extra }, busy, now);
}

/**
 * Jeremy became busy or free. Busy pauses a countdown back to held (it
 * restarts in full later); free starts the wait before the countdown.
 */
export function busyChanged(current: UpdateStatus, busy: string | null, now: number): UpdateStatus {
	if (!canApply(current)) return current;
	const waiting = current.held ?? current.countdown;
	if (!waiting || current.held?.busy === busy) return current;
	const { by, reason, extra } = waiting;
	if (busy !== null)
		return withPlan(current, { held: { by, reason, extra, busy, startsAt: null } });
	if (!current.held || current.held.busy === null) return current;
	return withPlan(current, {
		held: { ...current.held, busy: null, startsAt: now + UPDATE_FREE_MS },
	});
}

/**
 * Time passed: a held update whose free time is up starts the normal
 * countdown, and a batch whose window ended starts the normal flow (held
 * while Jeremy is `busy`, else the countdown).
 */
export function afterWait(current: UpdateStatus, now: number, busy: string | null): UpdateStatus {
	if (!canApply(current)) return current;
	if (current.batched)
		return current.batched.nextAt > now ? current : waitFor(current, current.batched, busy, now);
	if (!current.held) return current;
	const { startsAt } = current.held;
	if (startsAt === null || startsAt > now) return current;
	return withPlan(current, countdownOf(current.held, now));
}

/** When something is next due: the countdown's apply, a held update's start, or a batch's window end; null when nothing is. */
export function nextDeadline(status: UpdateStatus): number | null {
	if (!canApply(status)) return null;
	return status.countdown?.applyAt ?? status.held?.startsAt ?? status.batched?.nextAt ?? null;
}

/** Jeremy cancelled the countdown, or skipped the held update or the batch. */
export function withoutCountdown(current: UpdateStatus): UpdateStatus {
	if (!canApply(current) || (!current.countdown && !current.held && !current.batched))
		return current;
	return withPlan(current, {});
}

/** A build failed: the old build keeps running, and the target stays applicable for a retry. */
export function afterFailure(
	target: ApplicableStatus,
	failure: { readonly error: string; readonly logTail: string },
): UpdateStatus {
	return {
		state: "failed",
		head: target.head,
		commits: target.commits,
		behind: target.behind,
		error: failure.error,
		logTail: failure.logTail,
	};
}
