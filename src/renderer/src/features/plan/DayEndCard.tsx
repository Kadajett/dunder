import type { DayWrap, WrapPlanned } from "@shared/wrap";
import { BeadChip } from "../chief/BeadChip";
import { formatClock } from "../feed/feed-model";
import { AgentDot } from "../work/AgentDot";
import { laneLabels } from "../work/work-model";
import { dismissWrap, useWrap, wrapDue } from "./wrap-store";
import "../chief/chief-markdown.css";
import "../whats-new/whats-new.css";
import "./plan.css";

const laneText = (lane: WrapPlanned["lane"]): string =>
	lane === null ? "not on the board" : lane === "done" ? "done ✓" : laneLabels[lane].toLowerCase();

function Planned({ wrap }: { readonly wrap: DayWrap }) {
	if (wrap.planned.length === 0) return <p className="day-end__none">No plan today.</p>;
	const misses = new Map(wrap.input.misses.map((miss) => [miss.bead, miss.why]));
	return (
		<ol className="plan__items">
			{wrap.planned.map((item) => (
				<li key={item.bead} className="plan__item" data-lane={item.lane ?? "unknown"}>
					<div className="plan__item-head">
						<BeadChip id={item.bead} code={false} />
						<span className="plan__who">
							<AgentDot name={item.who} />
							{item.who}
						</span>
						<span className="today__lane">{laneText(item.lane)}</span>
					</div>
					{misses.has(item.bead) ? <p className="plan__why">{misses.get(item.bead)}</p> : null}
				</li>
			))}
		</ol>
	);
}

/**
 * Max's evening wrap-up, top-centre: the day against the morning plan
 * (where each planned item ended up and why the unfinished ones didn't
 * land), what shipped outside the plan, the day's spend, and his
 * proposals for tomorrow.
 */
export function DayEndCard() {
	const wrap = useWrap((state) => state.wrap);
	if (!wrapDue(wrap)) return null;
	return (
		<section className="whats-new plan day-end" aria-label="Day's end">
			<header className="whats-new__header">
				<div>
					<h2 className="whats-new__heading">Day's end</h2>
					<span className="whats-new__build">
						from Max at {formatClock(wrap.postedAt)}
						{wrap.spendUsd === null ? "" : ` · AI spend today ~$${wrap.spendUsd.toFixed(2)}`}
					</span>
				</div>
			</header>
			<p className="plan__focus">{wrap.input.summary}</p>
			<Planned wrap={wrap} />
			{wrap.unplanned.length > 0 ? (
				<div className="plan__not-today">
					<p>Also shipped</p>
					<ul className="day-end__beads">
						{wrap.unplanned.map((bead) => (
							<li key={bead.id}>
								<BeadChip id={bead.id} code={false} />
							</li>
						))}
					</ul>
				</div>
			) : null}
			<div className="plan__not-today">
				<p>Tomorrow</p>
				<ol>
					{wrap.input.tomorrow.map((item) => (
						<li key={`${item.bead ?? ""}${item.what}`}>
							{item.bead ? <BeadChip id={item.bead} code={false} /> : null} {item.what}
						</li>
					))}
				</ol>
			</div>
			<footer className="plan__actions">
				<button type="button" className="whats-new__done" onClick={dismissWrap}>
					Got it
				</button>
			</footer>
		</section>
	);
}
