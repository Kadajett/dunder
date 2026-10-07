import type { WorkCard } from "@shared/work-board";
import { useMemo, useState } from "react";
import { WorkLaneSection } from "./WorkLaneSection";
import { boardSummary, forAgent, groupByLane, pillText } from "./work-model";
import { useWork, useWorkCards } from "./work-store";
import "./work.css";

function WorkLanes({ cards }: { readonly cards: readonly WorkCard[] }) {
	const groups = useMemo(() => groupByLane(cards), [cards]);
	const expandedId = useWork((state) => state.expanded);
	const expand = useWork((state) => state.expand);
	const [dragging, setDragging] = useState<WorkCard | null>(null);
	const toggleCard = (id: string): void => expand(expandedId === id ? null : id);
	return (
		<>
			{groups.map((group) => (
				<WorkLaneSection
					key={group.lane}
					group={group}
					expandedId={expandedId}
					onToggleCard={toggleCard}
					dragging={dragging}
					onDrag={setDragging}
				/>
			))}
		</>
	);
}

function WorkBody({ cards }: { readonly cards: readonly WorkCard[] | undefined }) {
	const board = useWork((state) => state.board);
	if (cards) return <WorkLanes cards={cards} />;
	if (board?.state === "unavailable")
		return (
			<p className="work-bar__note" role="status">
				Beads unavailable: {board.reason}
			</p>
		);
	return <p className="work-bar__note">Loading the board…</p>;
}

/** "theo ×" at the top of the bar while it shows one agent's beads: clears the filter. */
function FilterPill({ agent }: { readonly agent: string }) {
	const filterAgent = useWork((state) => state.filterAgent);
	return (
		<button
			type="button"
			className="work-filter"
			title={`Showing only ${agent}'s beads: show everyone's`}
			onClick={() => filterAgent(null)}
		>
			{agent} <span aria-hidden="true">×</span>
		</button>
	);
}

/**
 * The left bar: the app repo's Beads by lane (In progress, Review, Blocked,
 * Ready, Done), with add, reprioritise, move and assign, optionally for one
 * agent only. Collapses to a summary pill. Mount `connectWork` once alongside
 * it; hiding in focus mode is the caller's.
 */
export function WorkBar() {
	const open = useWork((state) => state.open);
	const setOpen = useWork((state) => state.setOpen);
	const agent = useWork((state) => state.agentFilter);
	const filterAgent = useWork((state) => state.filterAgent);
	const all = useWorkCards();
	const cards = useMemo(() => (all && agent ? forAgent(all, agent) : all), [all, agent]);
	const summary = cards ? `${agent ? `${agent}: ` : ""}${boardSummary(cards)}` : "Beads";
	if (!open)
		return (
			<button
				type="button"
				className="work-pill"
				aria-expanded={false}
				aria-label={`${pillText(cards)}: open the work board`}
				onClick={() => setOpen(true)}
			>
				<span className="work-pill__dot" />
				<span>{agent && cards ? `Work · ${summary}` : pillText(cards)}</span>
				<span className="work-pill__chevron" aria-hidden="true">
					▸
				</span>
			</button>
		);
	return (
		<aside
			className="work-bar"
			aria-label="Work board"
			onKeyDown={(event) => {
				if (event.key === "Escape" && agent) filterAgent(null);
			}}
		>
			<header className="work-bar__head">
				<div>
					<h2>Work</h2>
					<p>{summary}</p>
				</div>
				{agent ? <FilterPill agent={agent} /> : null}
				<button
					type="button"
					className="work-bar__collapse"
					aria-expanded={true}
					aria-label="Collapse the work board"
					title="Collapse"
					onClick={() => setOpen(false)}
				>
					◂
				</button>
			</header>
			<div className="work-bar__body">
				<WorkBody cards={cards} />
			</div>
		</aside>
	);
}
