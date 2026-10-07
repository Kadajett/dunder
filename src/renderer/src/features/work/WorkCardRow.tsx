import { createLogger } from "@shared/log/logger";
import { type WorkCard, workLanes } from "@shared/work-board";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { useAgentStyle, useRosterStore } from "../hire/roster-store";
import { OpenInEditor } from "../worktrees/OpenInEditor";
import { epicTitle, spendLabel, spendTitle } from "./card-spend";
import { WorkError } from "./WorkError";
import { WorkMenuButton, type WorkMenuItem } from "./WorkMenu";
import { laneLabels, priorities, shortId, waitedFor } from "./work-model";
import { assignCard, moveCard, setCardPriority, useWork } from "./work-store";
import "./work-card.css";

/** How long a bead has waited for Max's review, re-read every minute. */
function ReviewWait({ since }: { readonly since: string }) {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(timer);
	}, []);
	const at = new Date(since);
	const title = `Waiting for Max's review since ${at.toLocaleString()}. That is the bead's last update: bd doesn't record when the review label was added.`;
	return (
		<p className="work-card__waiting work-card__waiting--review" title={title}>
			waiting {waitedFor(since, now)}
		</p>
	);
}

const log = createLogger("work");

/** The drag payload type: a bead id, so drops from elsewhere are ignored. */
export const CARD_MIME = "application/x-herdr-office-bead";

function AgentDot({ name }: { readonly name: string }) {
	const color = useAgentStyle(name).outfit.color;
	return <span className="work-dot" style={{ background: color }} />;
}

function PriorityChip({ card }: { readonly card: WorkCard }) {
	const items: WorkMenuItem[] = priorities.map((priority) => ({
		key: String(priority),
		label: `P${priority}`,
		checked: priority === card.priority,
		onSelect: () => void setCardPriority(card.id, priority),
	}));
	return (
		<WorkMenuButton
			className={`work-chip work-chip--priority work-chip--p${card.priority}`}
			label={`Priority P${card.priority}: change`}
			menuLabel="Priority"
			items={items}
		>
			P{card.priority}
		</WorkMenuButton>
	);
}

function AssigneeChip({ card }: { readonly card: WorkCard }) {
	const roster = useRosterStore((state) => state.roster);
	const names = useMemo(() => {
		const hired = (roster?.agents ?? [])
			.filter((agent) => agent.firedAt === undefined)
			.map((agent) => agent.name);
		return card.assignee && !hired.includes(card.assignee) ? [card.assignee, ...hired] : hired;
	}, [roster, card.assignee]);
	const items: WorkMenuItem[] = [
		...names.map((name) => ({
			key: name,
			label: (
				<>
					<AgentDot name={name} />
					{name}
				</>
			),
			checked: name === card.assignee,
			onSelect: () => void assignCard(card.id, name),
		})),
		{
			key: "",
			label: "unassigned",
			checked: card.assignee === null,
			onSelect: () => void assignCard(card.id, null),
		},
	];
	const assignee = card.assignee;
	if (!assignee)
		return (
			<WorkMenuButton
				className="work-chip work-chip--assignee"
				label="Unassigned: assign"
				menuLabel="Assignee"
				items={items}
			>
				<span className="work-chip__text">unassigned</span>
			</WorkMenuButton>
		);
	return (
		<span className="work-chip work-chip--assignee work-chip--split">
			<AgentFilterButton agent={assignee} />
			<WorkMenuButton
				className="work-chip__change"
				label={`Assigned to ${assignee}: change`}
				menuLabel="Assignee"
				items={items}
			>
				▾
			</WorkMenuButton>
		</span>
	);
}

/** The assignee's name: shows only their beads (again: everyone's). */
function AgentFilterButton({ agent }: { readonly agent: string }) {
	const filtered = useWork((state) => state.agentFilter === agent);
	const filterAgent = useWork((state) => state.filterAgent);
	return (
		<button
			type="button"
			className="work-chip__filter"
			aria-pressed={filtered}
			title={filtered ? "Show everyone's beads" : `Show only ${agent}'s beads`}
			onClick={() => filterAgent(filtered ? null : agent)}
		>
			<AgentDot name={agent} />
			<span className="work-chip__text">{agent}</span>
		</button>
	);
}

function MoreMenu({ card }: { readonly card: WorkCard }) {
	const items: WorkMenuItem[] = workLanes.map((lane) => ({
		key: lane,
		label: `Move to ${laneLabels[lane]}`,
		disabled: lane === card.lane,
		onSelect: () => void moveCard(card.id, lane),
	}));
	return (
		<WorkMenuButton className="work-card__more" label="Move to…" menuLabel="Move to" items={items}>
			⋯
		</WorkMenuButton>
	);
}

function CardDetail({ card }: { readonly card: WorkCard }) {
	const [copied, setCopied] = useState(false);
	const copy = (): void => {
		navigator.clipboard.writeText(card.id).then(
			() => setCopied(true),
			(error: unknown) => log.warn("copy bead id failed", error instanceof Error ? error : {}),
		);
	};
	return (
		<div className="work-card__detail">
			<p className="work-card__label">Description</p>
			<p className="work-card__text">{card.description.trim() || "No description."}</p>
			<p className="work-card__label">Acceptance</p>
			<p className="work-card__text">{card.acceptance.trim() || "No acceptance criteria."}</p>
			<button type="button" className="work-card__copy" onClick={copy}>
				{copied ? "Copied" : `Copy ${card.id}`}
			</button>
			{card.assignee ? <OpenInEditor agent={card.assignee} beads={[card.id]} exact /> : null}
		</div>
	);
}

interface WorkCardRowProps {
	readonly card: WorkCard;
	readonly expanded: boolean;
	readonly onToggle: (id: string) => void;
	readonly onDrag: (card: WorkCard | null) => void;
}

/** One bead: a dense title + meta row that expands in place to its read-only details. */
export function WorkCardRow({ card, expanded, onToggle, onDrag }: WorkCardRowProps) {
	const onDragStart = (event: DragEvent<HTMLLIElement>): void => {
		const { dataTransfer } = event;
		dataTransfer.setData(CARD_MIME, card.id);
		dataTransfer.effectAllowed = "move";
		onDrag(card);
	};
	return (
		<li
			className={`work-card work-card--${card.lane}${expanded ? " work-card--open" : ""}`}
			// Not while open, so the description's text can be selected.
			draggable={!expanded}
			onDragStart={onDragStart}
			onDragEnd={() => onDrag(null)}
		>
			<div className="work-card__head">
				<button
					type="button"
					className="work-card__title"
					title={card.title}
					aria-expanded={expanded}
					onClick={() => onToggle(card.id)}
				>
					{card.title}
				</button>
				<MoreMenu card={card} />
			</div>
			<div className="work-card__meta">
				<PriorityChip card={card} />
				<span className="work-card__id" title={card.id}>
					{shortId(card.id)}
				</span>
				<AssigneeChip card={card} />
				{card.spend !== null ? (
					<span className="work-card__spend" title={spendTitle(card)}>
						{spendLabel(card.spend)}
					</span>
				) : null}
				{card.epic ? (
					<span className="work-card__epic" title={epicTitle(card)}>
						{card.epic}
					</span>
				) : null}
			</div>
			{card.lane === "blocked" && card.waitingOn.length > 0 ? (
				<p className="work-card__waiting" title={card.waitingOn.join(", ")}>
					waiting on {card.waitingOn.map(shortId).join(", ")}
				</p>
			) : null}
			{card.lane === "review" ? <ReviewWait since={card.updatedAt} /> : null}
			{expanded ? <CardDetail card={card} /> : null}
			<WorkError errorKey={card.id} />
		</li>
	);
}
