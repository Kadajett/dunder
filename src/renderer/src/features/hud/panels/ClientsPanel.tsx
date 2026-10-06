import type { SessionSnapshot, WorkspaceInfo } from "@shared/herdr/schema";
import { useMemo } from "react";
import type { LiveAgent } from "../../office/model/live-agents";
import type { OfficeModel } from "../../office/model/office-model";
import { openAgentScreen } from "./open-agent";

interface Room {
	readonly workspace: WorkspaceInfo;
	readonly agents: readonly LiveAgent[];
}

/** The office's rooms (herdr workspaces) in herdr's order, with the agents in each. */
function roomsOf(snapshot: SessionSnapshot | null, agents: readonly LiveAgent[]): Room[] {
	if (!snapshot) return [];
	const workspaceOf = new Map(snapshot.agents.map((agent) => [agent.pane_id, agent.workspace_id]));
	return [...snapshot.workspaces]
		.sort((a, b) => a.number - b.number)
		.map((workspace) => ({
			workspace,
			agents: agents.filter((agent) => workspaceOf.get(agent.paneId) === workspace.workspace_id),
		}));
}

function RoomCard({ room, model }: { readonly room: Room; readonly model: OfficeModel }) {
	const working = room.agents.filter((agent) => agent.status === "working").length;
	return (
		<article className="hud-card">
			<div className="hud-card-head">
				<i className={`status-dot status-${room.workspace.agent_status}`} />
				<strong>#{room.workspace.label}</strong>
				<span className="hud-card-meta">
					{room.agents.length} agent{room.agents.length === 1 ? "" : "s"} · {working} working
				</span>
			</div>
			<p className="hud-card-line hud-card-meta">
				herdr workspace {room.workspace.number} · {room.workspace.pane_count} pane
				{room.workspace.pane_count === 1 ? "" : "s"}
			</p>
			{room.agents.length > 0 ? (
				<div className="hud-room-agents">
					{room.agents.map((agent) => {
						const seat = model.seated.find((seated) => seated.agent.paneId === agent.paneId);
						return (
							<button
								key={agent.paneId}
								type="button"
								disabled={!seat}
								title={seat ? `Open ${agent.name}'s screen` : `${agent.name} has no desk`}
								onClick={() => seat && openAgentScreen(seat)}
							>
								<i className={`status-dot status-${agent.status}`} />
								{agent.name}
							</button>
						);
					})}
				</div>
			) : null}
		</article>
	);
}

/** Clients: the office's rooms (herdr workspaces), who sits in each and how busy it is. */
export function ClientsPanel(props: {
	readonly model: OfficeModel;
	readonly snapshot: SessionSnapshot | null;
}) {
	const rooms = useMemo(
		() => roomsOf(props.snapshot, props.model.agents),
		[props.snapshot, props.model.agents],
	);
	if (rooms.length === 0) {
		return (
			<p className="hud-panel-empty">The office session has no rooms (herdr workspaces) yet.</p>
		);
	}
	return (
		<>
			{rooms.map((room) => (
				<RoomCard key={room.workspace.workspace_id} room={room} model={props.model} />
			))}
		</>
	);
}
