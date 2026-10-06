import "./update-pill.css";
import type { ApplicableStatus, UpdateCountdown, UpdateStatus } from "@shared/app-update";
import { type ReactNode, useEffect, useState } from "react";

/** The stable-mode update status, live from main ("dev" while the preload predates the API). */
function useUpdateStatus(): UpdateStatus {
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

interface PopoverProps {
	readonly onClose: () => void;
	readonly children: ReactNode;
}

function Popover({ onClose, children }: PopoverProps) {
	return (
		<>
			<button type="button" className="update-backdrop" aria-label="Close" onClick={onClose} />
			<div className="update-popover" role="dialog">
				{children}
			</div>
		</>
	);
}

type AvailableStatus = Extract<ApplicableStatus, { state: "available" }>;
type FailedStatus = Extract<ApplicableStatus, { state: "failed" }>;

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

function AvailablePill({ status }: { readonly status: AvailableStatus }) {
	const [open, setOpen] = useState(false);
	const label =
		status.behind > 0
			? `${status.behind} new commit${status.behind === 1 ? "" : "s"}`
			: `rebuild on ${status.head.slice(0, 7)}`;
	return (
		<div className="update">
			<button
				type="button"
				className="hud-chip update-pill"
				aria-expanded={open}
				title={status.commits.map((commit) => commit.subject).join("\n")}
				onClick={() => setOpen((value) => !value)}
			>
				<span className="update-dot" />
				Update · {label}
			</button>
			{open ? (
				<Popover onClose={() => setOpen(false)}>
					<p className="update-heading">New in the checkout</p>
					<CommitList status={status} />
					<p className="update-note">
						Dunder rebuilds, then relaunches on the new code. Your agents keep running.
					</p>
					<div className="update-actions">
						<button type="button" onClick={() => setOpen(false)}>
							Not now
						</button>
						<button
							type="button"
							className="update-primary"
							onClick={() => {
								setOpen(false);
								apply("from the HUD");
							}}
						>
							Update &amp; relaunch
						</button>
					</div>
				</Popover>
			) : null}
		</div>
	);
}

function FailedPill({ status }: { readonly status: FailedStatus }) {
	const [open, setOpen] = useState(false);
	return (
		<div className="update">
			<button
				type="button"
				className="hud-chip update-pill update-failed"
				aria-expanded={open}
				title={status.error}
				onClick={() => setOpen((value) => !value)}
			>
				Update failed · Retry
			</button>
			{open ? (
				<Popover onClose={() => setOpen(false)}>
					<p className="update-heading">Build failed: {status.error}</p>
					<p className="update-note">The previous build is still running.</p>
					<pre className="update-log">{status.logTail || "(no output)"}</pre>
					<div className="update-actions">
						<button type="button" onClick={() => setOpen(false)}>
							Close
						</button>
						<button
							type="button"
							className="update-primary"
							onClick={() => {
								setOpen(false);
								apply("retry from the HUD");
							}}
						>
							Retry
						</button>
					</div>
				</Popover>
			) : null}
		</div>
	);
}

/**
 * Stable-mode updates in the top bar: nothing when up to date or under the dev
 * server; otherwise new commits, build progress, a failure to retry, and the
 * countdown when an agent asked for the update with `office-update`.
 */
export function UpdatePill() {
	const status = useUpdateStatus();
	switch (status.state) {
		case "dev":
		case "idle":
			return null;
		case "building":
			return (
				<span className="hud-chip update-pill update-building" title={status.logTail}>
					<span className="update-spinner" />
					Updating…
				</span>
			);
		case "available":
		case "failed":
			return (
				<>
					{status.state === "available" ? (
						<AvailablePill status={status} />
					) : (
						<FailedPill status={status} />
					)}
					{status.countdown ? <CountdownBanner countdown={status.countdown} /> : null}
				</>
			);
	}
}
