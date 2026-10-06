import type { AgentStatus, SessionSnapshot } from "@shared/herdr/schema";
import type { OfficeAgent } from "@shared/layout/seating";

export interface LiveAgent extends OfficeAgent {
	readonly status: AgentStatus;
	/** Harness kind reported by herdr, e.g. `omp`, `claude`, `codex`. */
	readonly kind: string;
}

/** Every agent herdr currently detects in the office session. */
export function liveAgents(snapshot: SessionSnapshot | null): LiveAgent[] {
	if (!snapshot) return [];
	const workspaceLabel = new Map(snapshot.workspaces.map((ws) => [ws.workspace_id, ws.label]));
	return snapshot.agents.map((agent) => ({
		name: agent.name ?? `${agent.agent}-${agent.pane_id.replace(":", "-")}`,
		paneId: agent.pane_id,
		workspaceLabel: workspaceLabel.get(agent.workspace_id),
		status: agent.agent_status,
		kind: agent.agent,
	}));
}
