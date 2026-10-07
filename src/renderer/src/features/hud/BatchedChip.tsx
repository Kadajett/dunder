import type { UpdateBatched } from "@shared/app-update";
import { formatClock } from "../feed/feed-model";
import { applyUpdate, requesters, skipUpdate } from "./update-actions";

/** "1 change" / "12 changes": commits between the running build and HEAD (at least the requests). */
const changes = (count: number): string => `${count} ${count === 1 ? "change" : "changes"}`;

/**
 * Agents' updates waiting for the batch window to end: a quiet chip, no
 * countdown and no motion, so a stream of merges never interrupts Jeremy.
 */
export function BatchedChip({
	batched,
	behind,
}: {
	readonly batched: UpdateBatched;
	readonly behind: number;
}) {
	const title = `Latest from ${requesters(batched)}${batched.reason ? `: ${batched.reason}` : ""}`;
	return (
		<div className="update-held update-held--batched" role="status" title={title}>
			<span className="update-dot" />
			<span>
				<strong>{changes(Math.max(behind, batched.extra + 1))} waiting</strong> · next update ~
				{formatClock(batched.nextAt)}
			</span>
			<button
				type="button"
				className="update-held-apply"
				onClick={() => applyUpdate("now, by Jeremy (batched)")}
			>
				Apply now
			</button>
			<button type="button" className="update-held-skip" onClick={skipUpdate}>
				Skip
			</button>
		</div>
	);
}
