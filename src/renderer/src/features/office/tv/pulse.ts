import type { AgentStatus, SessionSnapshot } from "@shared/herdr/schema";

export interface WorkspacePulse {
	readonly label: string;
	/** Agent statuses in this workspace, busiest first. */
	readonly statuses: readonly AgentStatus[];
}

export interface OfficePulse {
	readonly total: number;
	readonly byStatus: Readonly<Record<AgentStatus, number>>;
	readonly workspaces: readonly WorkspacePulse[];
}

/** Display order: what needs attention first. */
export const PULSE_STATUSES: readonly AgentStatus[] = [
	"working",
	"blocked",
	"done",
	"idle",
	"unknown",
];

/** Agent counts by status and per workspace (workspaces without agents are listed empty). */
export function officePulse(snapshot: SessionSnapshot): OfficePulse {
	const byStatus: Record<AgentStatus, number> = {
		working: 0,
		blocked: 0,
		done: 0,
		idle: 0,
		unknown: 0,
	};
	for (const agent of snapshot.agents) byStatus[agent.agent_status] += 1;
	const rank = (status: AgentStatus): number => PULSE_STATUSES.indexOf(status);
	const workspaces = [...snapshot.workspaces]
		.sort((a, b) => a.number - b.number)
		.map((workspace) => ({
			label: workspace.label,
			statuses: snapshot.agents
				.filter((agent) => agent.workspace_id === workspace.workspace_id)
				.map((agent) => agent.agent_status)
				.sort((a, b) => rank(a) - rank(b)),
		}));
	return { total: snapshot.agents.length, byStatus, workspaces };
}
