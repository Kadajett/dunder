import { useState } from "react";
import { BeadChip } from "../chief/BeadChip";
import { AgentDot } from "../work/AgentDot";
import { laneLabels } from "../work/work-model";
import { useWork, useWorkCards } from "../work/work-store";
import { type ItemLane, itemLane, todayPillDue } from "./plan-model";
import { usePlan } from "./plan-store";
import "../chief/chief-markdown.css";
import "./plan.css";

const laneText = (lane: ItemLane): string =>
	lane === "done"
		? "done ✓"
		: lane === "unknown"
			? "not on the board"
			: laneLabels[lane].toLowerCase();

/**
 * The decided plan at the top of the work bar for the rest of the day:
 * the focus, opening to each item with its live lane, so by evening Jeremy
 * sees what landed.
 */
export function TodayPill() {
	const plan = usePlan((state) => state.plan);
	const cards = useWorkCards();
	const closedToday = useWork((state) =>
		state.board?.state === "ok" ? (state.board.closedToday ?? []) : [],
	);
	const [open, setOpen] = useState(false);
	if (!plan || !todayPillDue(plan) || !cards) return null;
	const items = plan.plan.items.map((item) => ({
		item,
		lane: itemLane(item.bead, cards, closedToday),
	}));
	const done = items.filter((entry) => entry.lane === "done").length;
	return (
		<div className="today" data-open={open}>
			<button
				type="button"
				className="today__pill"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				<span className="today__label">Today</span>
				<span className="today__focus">{plan.plan.focus}</span>
				<span className="today__count">
					{done}/{items.length}
				</span>
			</button>
			{open ? (
				<ol className="today__items">
					{items.map(({ item, lane }) => (
						<li key={item.bead} data-lane={lane}>
							<BeadChip id={item.bead} code={false} />
							<span className="plan__who">
								<AgentDot name={item.who} />
								{item.who}
							</span>
							<span className="today__lane">{laneText(lane)}</span>
						</li>
					))}
				</ol>
			) : null}
		</div>
	);
}
