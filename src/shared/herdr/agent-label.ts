import type { AgentInfo } from "./schema";

/** The agent's name, or a stable stand-in until herdr has one (as `liveAgents` names them). */
export function agentName(agent: AgentInfo): string {
	return agent.name ?? `${agent.agent}-${agent.pane_id.replace(":", "-")}`;
}

/** What the agent says it is doing: its terminal title, without omp's `π >` prompt glyph. */
export function agentActivity(agent: AgentInfo): string | undefined {
	return agent.terminal_title_stripped?.replace(/^\S{1,3}\s*>\s+/u, "") || undefined;
}
