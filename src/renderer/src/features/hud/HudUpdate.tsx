import "./hud-update.css";
import type {
	ApplicableStatus,
	UpdateCountdown,
	UpdateHeld,
	UpdateStatus,
} from "@shared/app-update";
import { useEffect, useId, useState } from "react";
import { useCall } from "../chief/call/call-store";
import { BatchedChip } from "./BatchedChip";
import { useSecondsLeft } from "./countdown";
import { RollbackSection } from "./HudRollback";
import { applyUpdate, requesters, skipUpdate } from "./update-actions";

/** The stable-mode update status, live from main ("dev" while the preload predates the API). */
export function useUpdateStatus(): UpdateStatus {
	const [status, setStatus] = useState<UpdateStatus>({ state: "dev" });
	useEffect(() => {
		// A renderer hot-reloaded against an older preload has no `update` API: show nothing.
		if (!("update" in window.office)) return;
		let live = true;
		const off = window.office.update.onStatus(setStatus);
		window.office.update
			.status()
			.then((initial) => {
				if (live) setStatus(initial);
			})
			// Main predates the updater (no handler yet): stay quiet until it restarts.
			.catch(() => undefined);
		return () => {
			live = false;
			off();
		};
	}, []);
	return status;
}

function CountdownBanner({ countdown }: { readonly countdown: UpdateCountdown }) {
	const seconds = useSecondsLeft(countdown.applyAt);
	const onCall = useCall((state) => state.active);
	return (
		<div className="update-banner" role="alert">
			<span>
				<strong>{requesters(countdown)} requested an update</strong>
				{countdown.reason ? `: ${countdown.reason}` : ""} — applying in {seconds} s
			</span>
			{onCall ? (
				<span className="update-banner-call">📞 Call will resume after the update</span>
			) : null}
			<button type="button" className="update-banner-cancel" onClick={skipUpdate}>
				Cancel
			</button>
			<button
				type="button"
				className="update-banner-apply"
				onClick={() => applyUpdate("now, by Jeremy")}
			>
				Apply now
			</button>
		</div>
	);
}

function WaitLine({ held }: { readonly held: UpdateHeld }) {
	const seconds = useSecondsLeft(held.startsAt);
	if (held.busy !== null) return <>applies when you're free ({held.busy})</>;
	return <>you're free: countdown in {seconds} s</>;
}

/** An agent's update waiting while Jeremy is busy: small, so it never interrupts him. */
function HeldChip({ held }: { readonly held: UpdateHeld }) {
	return (
		<div className="update-held" role="status" title={held.reason || undefined}>
			<span className="update-dot" />
			<span>
				Update from <strong>{requesters(held)}</strong> waiting · <WaitLine held={held} />
			</span>
			<button
				type="button"
				className="update-held-apply"
				onClick={() => applyUpdate("now, by Jeremy")}
			>
				Apply now
			</button>
			<button type="button" className="update-held-skip" onClick={skipUpdate}>
				Skip
			</button>
		</div>
	);
}

/**
 * Top-centre update strip: the countdown banner while an agent's
 * `office-update` request waits for Jeremy to cancel it, the held chip while
 * he is busy, or the batched chip while requests wait for the batch window.
 */
export function UpdateCountdownBanner({ status }: { readonly status: UpdateStatus }) {
	if (status.state !== "available" && status.state !== "failed") return null;
	if (status.held) return <HeldChip held={status.held} />;
	if (status.batched) return <BatchedChip batched={status.batched} behind={status.behind} />;
	return status.countdown ? <CountdownBanner countdown={status.countdown} /> : null;
}

function CommitList({ status }: { readonly status: ApplicableStatus }) {
	return (
		<ul className="update-commits">
			{status.commits.map((commit) => (
				<li key={commit.sha}>
					<code>{commit.sha.slice(0, 7)}</code> {commit.subject}
				</li>
			))}
			{status.behind > status.commits.length ? (
				<li>…and {status.behind - status.commits.length} more</li>
			) : null}
		</ul>
	);
}

interface ApplyButtonProps {
	readonly label: string;
	readonly reason: string;
	readonly onDone: () => void;
}

function ApplyButton({ label, reason, onDone }: ApplyButtonProps) {
	return (
		<button
			type="button"
			role="menuitem"
			className="update-primary"
			onClick={() => {
				onDone();
				applyUpdate(reason);
			}}
		>
			{label}
		</button>
	);
}

type Applicable<State extends ApplicableStatus["state"]> = Extract<
	ApplicableStatus,
	{ state: State }
>;

/** The failed build's log behind a menu item, so arrow-key navigation reaches it (a `<details>` would not be). */
function BuildLog({ log }: { readonly log: string }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	return (
		<div className="update-log">
			<button
				type="button"
				role="menuitem"
				className="update-log-toggle"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => setOpen((value) => !value)}
			>
				{open ? "Hide build log" : "Show build log"}
			</button>
			{open ? <pre id={id}>{log || "(no output)"}</pre> : null}
		</div>
	);
}

function Available({
	status,
	onDone,
}: {
	readonly status: Applicable<"available">;
	readonly onDone: () => void;
}) {
	if (status.rolledBack) {
		const { from, newer } = status.rolledBack;
		return (
			<>
				<p className="hud-menu-heading update-heading">
					You rolled back from {from.slice(0, 7)}
					{newer > 0 ? ` · ${newer} newer commit${newer === 1 ? "" : "s"}` : ""}
				</p>
				<CommitList status={status} />
				<p className="update-note">
					Agents' updates stay off, even for newer commits, until you update.
				</p>
				<ApplyButton label="Update anyway" reason="anyway, by Jeremy" onDone={onDone} />
			</>
		);
	}
	const label =
		status.behind > 0
			? `${status.behind} new commit${status.behind === 1 ? "" : "s"}`
			: `rebuild on ${status.head.slice(0, 7)}`;
	return (
		<>
			<p className="hud-menu-heading update-heading">
				<span className="update-dot" />
				Update · {label}
			</p>
			<CommitList status={status} />
			<p className="update-note">
				Dunder rebuilds, then relaunches on the new code. Your agents keep running.
			</p>
			<ApplyButton label="Update & relaunch" reason="from the HUD" onDone={onDone} />
		</>
	);
}

function Failed({
	status,
	onDone,
}: {
	readonly status: Applicable<"failed">;
	readonly onDone: () => void;
}) {
	return (
		<>
			<p className="hud-menu-heading update-heading update-failed">Update failed</p>
			<p className="update-note">
				Build failed: {status.error}. The previous build is still running.
			</p>
			<BuildLog log={status.logTail} />
			<ApplyButton label="Retry" reason="retry from the HUD" onDone={onDone} />
		</>
	);
}

/**
 * The update part of the top-bar menu: nothing under the dev server;
 * otherwise the new commits to apply, build progress, or a failure to retry,
 * plus 'Roll back to <sha>' while the previous build is kept. `onDone`
 * closes the menu once an update or rollback is started.
 */
export function UpdateMenuSection({
	status,
	onDone,
}: {
	readonly status: UpdateStatus;
	readonly onDone: () => void;
}) {
	switch (status.state) {
		case "dev":
			return null;
		case "idle":
			return <RollbackSection onDone={onDone} />;
		case "building":
			return (
				<div className="update-section">
					<p className="hud-menu-heading update-heading" title={status.logTail}>
						<span className="update-spinner" />
						Updating…
					</p>
				</div>
			);
		case "available":
			return (
				<>
					<div className="update-section">
						<Available status={status} onDone={onDone} />
					</div>
					<RollbackSection onDone={onDone} />
				</>
			);
		case "failed":
			return (
				<>
					<div className="update-section">
						<Failed status={status} onDone={onDone} />
					</div>
					<RollbackSection onDone={onDone} />
				</>
			);
	}
}
