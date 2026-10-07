import type { WorkCard, WorkLane } from "@shared/work-board";
import { type DragEvent, useState } from "react";
import { AddTicket } from "./AddTicket";
import { CARD_MIME, WorkCardRow } from "./WorkCardRow";
import { type LaneGroup, laneLabels } from "./work-model";
import { moveCard, useWork } from "./work-store";

/** Native drop target for a lane: takes a dragged card from any other lane. */
function useLaneDrop(
	lane: WorkLane,
	dragging: WorkCard | null,
	onDrag: (card: WorkCard | null) => void,
) {
	const [over, setOver] = useState(false);
	const accepts = dragging !== null && dragging.lane !== lane;
	const handlers = {
		onDragOver: (event: DragEvent<HTMLElement>): void => {
			const { dataTransfer } = event;
			if (!accepts || !dataTransfer.types.includes(CARD_MIME)) return;
			event.preventDefault();
			dataTransfer.dropEffect = "move";
			setOver(true);
		},
		onDragLeave: (event: DragEvent<HTMLElement>): void => {
			const to = event.relatedTarget;
			if (!(to instanceof Node && event.currentTarget.contains(to))) setOver(false);
		},
		onDrop: (event: DragEvent<HTMLElement>): void => {
			event.preventDefault();
			setOver(false);
			const id = event.dataTransfer.getData(CARD_MIME);
			if (accepts && id) void moveCard(id, lane);
			onDrag(null);
		},
	};
	return { dropping: over && accepts, handlers };
}

function LaneHead({ lane, count }: { readonly lane: WorkLane; readonly count: number }) {
	const collapsed = useWork((state) => state.collapsed[lane]);
	const toggleLane = useWork((state) => state.toggleLane);
	return (
		<h3 className="work-lane__heading">
			<button
				type="button"
				className="work-lane__head"
				aria-expanded={!collapsed}
				onClick={() => toggleLane(lane)}
			>
				<span className="work-lane__chevron" aria-hidden="true">
					{collapsed ? "▸" : "▾"}
				</span>
				<span className="work-lane__name">{laneLabels[lane]}</span>
				<span className="work-lane__count">{count}</span>
			</button>
		</h3>
	);
}

interface WorkLaneSectionProps {
	readonly group: LaneGroup;
	readonly expandedId: string | null;
	readonly onToggleCard: (id: string) => void;
	/** The card being dragged, if any: every other lane (header included) takes the drop. */
	readonly dragging: WorkCard | null;
	readonly onDrag: (card: WorkCard | null) => void;
}

/** A lane: a collapsible header with its count, then its cards; Ready starts with the add row. */
export function WorkLaneSection({
	group,
	expandedId,
	onToggleCard,
	dragging,
	onDrag,
}: WorkLaneSectionProps) {
	const { lane, cards } = group;
	const collapsed = useWork((state) => state.collapsed[lane]);
	const filter = useWork((state) => state.agentFilter);
	const { dropping, handlers } = useLaneDrop(lane, dragging, onDrag);
	return (
		<section
			className={`work-lane work-lane--${lane}${dropping ? " work-lane--drop" : ""}`}
			aria-label={laneLabels[lane]}
			{...handlers}
		>
			<LaneHead lane={lane} count={cards.length} />
			{!collapsed && lane === "ready" ? <AddTicket /> : null}
			{!collapsed && cards.length > 0 ? (
				<ol className="work-lane__cards">
					{cards.map((card) => (
						<WorkCardRow
							key={card.id}
							card={card}
							expanded={card.id === expandedId}
							onToggle={onToggleCard}
							onDrag={onDrag}
						/>
					))}
				</ol>
			) : null}
			{!collapsed && cards.length === 0 && filter ? (
				<p className="work-lane__empty">nothing for {filter}</p>
			) : null}
		</section>
	);
}
