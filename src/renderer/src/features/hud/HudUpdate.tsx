import "./hud-update.css";
import type { ApplicableStatus, UpdateCountdown, UpdateStatus } from "@shared/app-update";
import { useEffect, useState } from "react";

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

/** Whole seconds until `applyAt`, ticking down. */
function useSecondsLeft(applyAt: number): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(timer);
	}, []);
	return Math.max(0, Math.ceil((applyAt - now) / 1000));
}

/** Failures surface through the status (state "failed"), so a rejected call needs no handling. */
function apply(reason: string): void {
	window.office.update.apply(reason).catch(() => undefined);
}

function CountdownBanner({ countdown }: { readonly countdown: UpdateCountdown }) {
	const seconds = useSecondsLeft(countdown.applyAt);
	const who = countdown.by.charAt(0).toUpperCase() + countdown.by.slice(1);
	return (
		<div className="update-banner" role="alert">
			<span>
				<strong>{who} requested an update</strong>
				{countdown.reason ? `: ${countdown.reason}` : ""} — applying in {seconds} s
			</span>
			<button
				type="button"
				className="update-banner-cancel"
				onClick={() => void window.office.update.cancel().catch(() => undefined)}
			>
				Cancel
			</button>
			<button type="button" className="update-banner-apply" onClick={() => apply("now, by Jeremy")}>
				Apply now
			</button>
		</div>
	);
}

/** The countdown banner while an agent's `office-update` request waits for Jeremy to cancel it. */
export function UpdateCountdownBanner({ status }: { readonly status: UpdateStatus }) {
	if (status.state !== "available" && status.state !== "failed") return null;
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
				apply(reason);
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

function Available({
	status,
	onDone,
}: {
	readonly status: Applicable<"available">;
	readonly onDone: () => void;
}) {
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
			<details className="update-log">
				<summary>Build log</summary>
				<pre>{status.logTail || "(no output)"}</pre>
			</details>
			<ApplyButton label="Retry" reason="retry from the HUD" onDone={onDone} />
		</>
	);
}

/**
 * The update part of the top-bar menu: nothing when up to date or under the dev
 * server; otherwise the new commits to apply, build progress, or a failure to retry.
 * `onDone` closes the menu once an update is started.
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
		case "idle":
			return null;
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
				<div className="update-section">
					<Available status={status} onDone={onDone} />
				</div>
			);
		case "failed":
			return (
				<div className="update-section">
					<Failed status={status} onDone={onDone} />
				</div>
			);
	}
}
