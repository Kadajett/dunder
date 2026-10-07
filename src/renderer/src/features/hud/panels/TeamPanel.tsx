import "../../office/interaction/cards.css";
import { avatarStyleFor } from "@shared/avatar/style";
import type { RosterAgent } from "@shared/company/roster";
import { type AgentModel, shortModelName } from "@shared/models";
import { useMemo } from "react";
import { formatClock } from "../../feed/feed-model";
import { useFeed } from "../../feed/feed-store";
import { useHire } from "../../hire/hire-store";
import { useRosterStore } from "../../hire/roster-store";
import type { LiveAgent } from "../../office/model/live-agents";
import type { OfficeModel } from "../../office/model/office-model";
import { ModelPicker } from "../../office/models/ModelPicker";
import { useModels } from "../../office/models/models-store";
import { poolStatusOf, usePool } from "../../pool/pool-store";
import { useWorkCards } from "../../work/work-store";
import { OpenInEditor } from "../../worktrees/OpenInEditor";
import { StatTiles } from "../StatTiles";
import { InterruptControl } from "./InterruptControl";
import { openAgentScreen } from "./open-agent";

const STATUS_LABEL = {
	working: "working",
	idle: "idle",
	done: "done — not seen yet",
	blocked: "blocked — needs you",
	unknown: "status unknown",
} as const;

/** The live model line; only omp agents report one. */
function modelLabel(kind: string, live: AgentModel | undefined): string | undefined {
	if (live?.pending) return `switching to ${shortModelName(live.pending.model)}…`;
	if (kind !== "omp") return undefined;
	return `${shortModelName(live?.model)}${live?.thinking ? ` · ${live.thinking}` : ""}`;
}

function Row({ label, value }: { readonly label: string; readonly value: string | undefined }) {
	if (!value) return null;
	return (
		<div className="card-row">
			<span>{label}</span>
			<code title={value}>{value}</code>
		</div>
	);
}

function TeamCard(props: {
	readonly agent: LiveAgent;
	readonly hired: RosterAgent | undefined;
	readonly model: OfficeModel;
}) {
	const { agent, hired } = props;
	const color = useMemo(
		() => (hired?.style ?? avatarStyleFor(agent.name)).outfit.color,
		[hired, agent.name],
	);
	const live = useModels((state) => state.live[agent.name]);
	const seat = props.model.seated.find((seated) => seated.agent.paneId === agent.paneId);
	const latest = useFeed((state) => state.items.find((item) => item.paneId === agent.paneId));
	const pool = usePool((state) => poolStatusOf(state.view, agent.name));
	const cards = useWorkCards();
	// Its current beads first (in progress, then in review): the worktree to look at.
	const beads = useMemo(
		() =>
			(cards ?? [])
				.filter(
					(card) =>
						card.assignee === agent.name && (card.lane === "in_progress" || card.lane === "review"),
				)
				.map((card) => card.id),
		[cards, agent.name],
	);
	return (
		<article className="hud-card">
			<div className="hud-card-head">
				<span className="hud-mii" style={{ background: color }}>
					<i className={`status-dot status-${agent.status}`} />
				</span>
				<strong>{agent.name}</strong>
				<span className="hud-card-meta">{STATUS_LABEL[agent.status]}</span>
			</div>
			{hired?.role ? <p className="hud-card-line">{hired.role}</p> : null}
			<div className="hud-team-rows">
				<Row label="now" value={latest && `${formatClock(latest.at)} ${latest.action}`} />
				<Row label="pool" value={pool} />
				<Row label="room" value={agent.workspaceLabel ? `#${agent.workspaceLabel}` : undefined} />
				<Row label="harness" value={hired?.harness ?? agent.kind} />
				<Row label="model" value={modelLabel(agent.kind, live)} />
				<Row label="desk" value={seat?.desk.id ?? "no desk"} />
			</div>
			{agent.kind === "omp" && "models" in window.office ? (
				<details>
					<summary>Switch model</summary>
					<ModelPicker agentName={agent.name} />
				</details>
			) : null}
			<div className="hud-card-actions">
				<button
					type="button"
					className="secondary"
					disabled={!seat}
					onClick={() => seat && openAgentScreen(seat)}
				>
					Open screen
				</button>
			</div>
			<InterruptControl name={agent.name} status={agent.status} />
			<OpenInEditor agent={agent.name} beads={beads} />
		</article>
	);
}

/** Team: live figures, then every agent in the office with status, room, model and role. */
export function TeamPanel({ model }: { readonly model: OfficeModel }) {
	const roster = useRosterStore((state) => state.roster);
	const hiredByName = useMemo(
		() => new Map((roster?.agents ?? []).map((agent) => [agent.name, agent])),
		[roster],
	);
	const showHire = useHire((state) => state.show);
	const hire = (
		<button type="button" className="card-action team-hire" onClick={showHire}>
			+ Hire an agent
		</button>
	);
	if (model.agents.length === 0) {
		return (
			<>
				<StatTiles model={model} />
				{hire}
				<p className="hud-panel-empty">No agents in the office session yet.</p>
			</>
		);
	}
	return (
		<>
			<StatTiles model={model} />
			{hire}
			{model.agents.map((agent) => (
				<TeamCard
					key={agent.paneId}
					agent={agent}
					hired={hiredByName.get(agent.name)}
					model={model}
				/>
			))}
		</>
	);
}
