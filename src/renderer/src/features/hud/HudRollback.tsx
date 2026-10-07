import type { PreviousBuild } from "@shared/app-update";
import { createLogger } from "@shared/log/logger";
import { useEffect, useState } from "react";

const log = createLogger("app-update");

/** The kept previous build, asked for each time the menu opens; null while loading or when none is kept. */
function usePreviousBuild(): PreviousBuild | null {
	const [previous, setPrevious] = useState<PreviousBuild | null>(null);
	useEffect(() => {
		// A preload from before rollbacks: nothing to offer.
		if (!("update" in window.office) || !("previous" in window.office.update)) return;
		let live = true;
		window.office.update.previous().then(
			(build) => {
				if (live) setPrevious(build);
			},
			(error: unknown) => log.warn("cannot read the previous build", { error }),
		);
		return () => {
			live = false;
		};
	}, []);
	return previous;
}

/** 'Roll back to 1a2b3c4?' with what it does and doesn't undo. */
function Confirm({
	previous,
	onCancel,
	onDone,
}: {
	readonly previous: PreviousBuild;
	readonly onCancel: () => void;
	readonly onDone: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const rollBack = (): void => {
		setBusy(true);
		window.office.update.rollback().then(
			(result) => {
				if (result.ok) onDone();
				else setError(`Can't roll back: ${result.error}.`);
				setBusy(false);
			},
			(failure: unknown) => {
				setError(
					`Can't roll back: ${failure instanceof Error ? failure.message : String(failure)}.`,
				);
				setBusy(false);
			},
		);
	};
	return (
		<>
			<p className="update-note">
				Roll back to <code>{previous.commit.slice(0, 7)}</code>? Dunder relaunches on it; your
				agents keep running. Data the newer build changed (whiteboard, pool, roster) stays as it is,
				and the older build may not read all of it. Agents can't update back onto this build until a
				newer commit lands.
			</p>
			{error ? <p className="update-note update-rollback-error">{error}</p> : null}
			<button
				type="button"
				role="menuitem"
				className="update-primary"
				disabled={busy}
				onClick={rollBack}
			>
				{busy ? "Rolling back…" : "Roll back & relaunch"}
			</button>
			<button type="button" role="menuitem" className="update-rollback-cancel" onClick={onCancel}>
				Cancel
			</button>
		</>
	);
}

/**
 * 'Roll back to <sha>' in the update menu while the build the last update
 * replaced is kept: one click to confirm, one to go back. Disabled when the
 * dependencies changed since, as the old build can't run on today's modules.
 */
export function RollbackSection({ onDone }: { readonly onDone: () => void }) {
	const previous = usePreviousBuild();
	const [confirming, setConfirming] = useState(false);
	if (!previous) return null;
	const label = `Roll back to ${previous.commit.slice(0, 7)}`;
	return (
		<div className="update-section update-rollback">
			{confirming ? (
				<Confirm previous={previous} onCancel={() => setConfirming(false)} onDone={onDone} />
			) : (
				<button
					type="button"
					role="menuitem"
					className="update-rollback-item"
					disabled={previous.dependenciesChanged}
					title={previous.subject || undefined}
					onClick={() => setConfirming(true)}
				>
					<span>↶ {label}</span>
					<small>
						{previous.dependenciesChanged
							? "not possible: the dependencies changed since"
							: previous.subject || "the build before this update"}
					</small>
				</button>
			)}
		</div>
	);
}
