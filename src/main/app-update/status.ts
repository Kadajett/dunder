import {
	type ApplicableStatus,
	MAX_LISTED_COMMITS,
	UPDATE_COUNTDOWN_MS,
	UPDATE_FREE_MS,
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
 * dev server. A HEAD Jeremy rolled back from (`rolledBackFrom`) is offered
 * without any agent's countdown, marked as the one he left.
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
	if (check.head === rolledBackFrom) return { state: "available", ...behind, rolledBack: true };
	const plan = canApply(current) ? planOf(current) : {};
	return { state: "available", ...behind, ...plan };
}

/** An agent's request to roll forward, as the HUD names it. */
export interface UpdateRequest {
	readonly by: string;
	readonly reason: string;
}

type Plan =
	| { readonly countdown: UpdateCountdown }
	| { readonly held: UpdateHeld }
	| Record<never, never>;

function planOf(status: ApplicableStatus): Plan {
	if (status.countdown) return { countdown: status.countdown };
	if (status.held) return { held: status.held };
	return {};
}

/** The same status, counting down, held, or neither (never both). */
function withPlan(status: ApplicableStatus, plan: Plan): ApplicableStatus {
	const { countdown: _countdown, held: _held, ...rest } = status;
	return { ...rest, ...plan };
}

const countdownOf = (
	{ by, reason, extra }: Pick<UpdateCountdown, "by" | "reason" | "extra">,
	now: number,
) => ({
	countdown: { by, reason, extra, applyAt: now + UPDATE_COUNTDOWN_MS },
});

/**
 * A fresh agent request (only when there is something to apply). While
 * Jeremy is busy it is held; otherwise the countdown starts (or restarts).
 * A request on top of a waiting one is folded in: the latest names it, the
 * rest are counted, and the update applies once.
 */
export function requestUpdate(
	current: UpdateStatus,
	request: UpdateRequest,
	busy: string | null,
	now: number,
): UpdateStatus {
	// The build Jeremy rolled back from: only he can choose to go back to it.
	if (!canApply(current) || current.rolledBack) return current;
	const earlier = current.held ?? current.countdown;
	const extra = earlier ? earlier.extra + 1 : 0;
	if (busy !== null)
		return withPlan(current, { held: { ...request, extra, busy, startsAt: null } });
	// Already waiting out his free time: keep waiting, with the new request folded in.
	if (current.held) return withPlan(current, { held: { ...current.held, ...request, extra } });
	return withPlan(current, countdownOf({ ...request, extra }, now));
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

/** Time passed: a held update whose free time is up starts the normal countdown. */
export function afterWait(current: UpdateStatus, now: number): UpdateStatus {
	if (!canApply(current) || !current.held) return current;
	const { startsAt } = current.held;
	if (startsAt === null || startsAt > now) return current;
	return withPlan(current, countdownOf(current.held, now));
}

/** When something is next due: the countdown's apply, or a held update's start; null when nothing is. */
export function nextDeadline(status: UpdateStatus): number | null {
	if (!canApply(status)) return null;
	return status.countdown?.applyAt ?? status.held?.startsAt ?? null;
}

/** Jeremy cancelled the countdown or skipped the held update. */
export function withoutCountdown(current: UpdateStatus): UpdateStatus {
	if (!canApply(current) || (!current.countdown && !current.held)) return current;
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
