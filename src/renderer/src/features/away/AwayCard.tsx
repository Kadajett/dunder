import type { AwaySummary } from "@shared/away";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { formatClock } from "../feed/feed-model";
import { useHud } from "../hud/view-store";
import { useWhatsNew } from "../whats-new/whats-new-store";
import { useWork } from "../work/work-store";
import "../whats-new/whats-new.css";
import "./away.css";

const useAway = create<{ readonly summary: AwaySummary | null }>(() => ({ summary: null }));

const api = () => ("away" in window.office ? window.office.away : null);

/** Follow main's summaries (and pick up one waiting after a reload); returns the cleanup. */
function connectAway(): () => void {
	const away = api();
	if (!away) return () => undefined;
	void away
		.get()
		.then((summary) => summary && useAway.setState({ summary }))
		.catch(() => undefined);
	return away.onSummary((summary) => useAway.setState({ summary }));
}

function dismiss(): void {
	useAway.setState({ summary: null });
	void api()
		?.dismiss()
		.catch(() => undefined);
}

/** `9 h` or `2 h 40 min`. */
export function awayFor(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return hours >= 5 || rest === 0 ? `${Math.round(minutes / 60)} h` : `${hours} h ${rest} min`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Titles listed before the rest fold under "N more". */
const CLOSED_SHOWN = 6;

function ClosedBeads({ closed }: { readonly closed: AwaySummary["closed"] }) {
	const reveal = useWork((state) => state.reveal);
	const [all, setAll] = useState(false);
	const shown = all ? closed : closed.slice(0, CLOSED_SHOWN);
	return (
		<li>
			<strong>{plural(closed.length, "bead closed", "beads closed")}</strong>
			<ul className="away__beads">
				{shown.map((bead) => (
					<li key={bead.id}>
						<button
							type="button"
							title={`Show ${bead.id} on the work board`}
							onClick={() => reveal(bead.id)}
						>
							{bead.title}
						</button>
					</li>
				))}
			</ul>
			{shown.length < closed.length ? (
				<button type="button" className="whats-new__more" onClick={() => setAll(true)}>
					{closed.length - shown.length} more
				</button>
			) : null}
		</li>
	);
}

function Sections({ summary }: { readonly summary: AwaySummary }) {
	return (
		<ul className="away__sections">
			{summary.closed.length > 0 ? <ClosedBeads closed={summary.closed} /> : null}
			{summary.asks > 0 ? (
				<li>
					<button
						type="button"
						className="away__link"
						onClick={() => useHud.setState({ panel: "inbox" })}
					>
						{plural(summary.asks, "ask waiting for you", "asks waiting for you")}
					</button>
				</li>
			) : null}
			{summary.updates > 0 ? (
				<li>
					<strong>{plural(summary.updates, "update applied", "updates applied")}</strong>
					<span className="away__note"> (What's new has the details)</span>
				</li>
			) : null}
			{summary.spendUsd !== null ? (
				<li>
					AI spend while away: <strong>~${summary.spendUsd.toFixed(2)}</strong>
				</li>
			) : null}
		</ul>
	);
}

/**
 * After 2 h or more away: what happened meanwhile, top-centre in the What's
 * new card's place (and after it, when both are due).
 */
export function AwayCard() {
	useEffect(connectAway, []);
	const summary = useAway((state) => state.summary);
	const whatsNewDue = useWhatsNew((state) => !state.settled || state.card !== null);
	if (!summary || whatsNewDue) return null;
	return (
		<section className="whats-new away" aria-label="While you were away">
			<header className="whats-new__header">
				<div>
					<h2 className="whats-new__heading">While you were away</h2>
					<span className="whats-new__build">
						away {awayFor(summary.backAt - summary.awayAt)} · since {formatClock(summary.awayAt)}
					</span>
				</div>
				<button type="button" className="whats-new__done" onClick={dismiss}>
					Dismiss
				</button>
			</header>
			<Sections summary={summary} />
		</section>
	);
}
