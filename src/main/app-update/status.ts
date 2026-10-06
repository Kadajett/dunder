import {
	type ApplicableStatus,
	MAX_LISTED_COMMITS,
	type UpdateCommit,
	type UpdateCountdown,
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

/** Fold a fresh check into the status. Checks never interrupt a build or the dev server. */
export function afterCheck(current: UpdateStatus, built: string, check: UpdateCheck): UpdateStatus {
	if (current.state === "dev" || current.state === "building") return current;
	if (check.head === built) return { state: "idle", head: check.head };
	// The same HEAD that just failed to build: keep the failure (and its log) on screen.
	if (current.state === "failed" && current.head === check.head) return current;
	const countdown = canApply(current) ? current.countdown : undefined;
	return {
		state: "available",
		head: check.head,
		commits: check.commits.slice(0, MAX_LISTED_COMMITS),
		behind: check.commits.length,
		...(countdown ? { countdown } : {}),
	};
}

/** Start an agent-requested countdown; only when there is something to apply. */
export function withCountdown(current: UpdateStatus, countdown: UpdateCountdown): UpdateStatus {
	return canApply(current) ? { ...current, countdown } : current;
}

export function withoutCountdown(current: UpdateStatus): UpdateStatus {
	if (!canApply(current) || !current.countdown) return current;
	const { countdown: _dropped, ...rest } = current;
	return rest;
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
