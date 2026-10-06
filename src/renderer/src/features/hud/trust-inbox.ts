import type { AgentStatus, SessionSnapshot } from "@shared/herdr/schema";
import type { SeenDone } from "@shared/office-stats";

/** What the Trust Inbox needs to know about one live agent. */
export interface InboxAgent {
	readonly name: string;
	readonly paneId: string;
	readonly status: AgentStatus;
	/** herdr's `state_change_seq`: identifies this particular `done`. */
	readonly seq: number | undefined;
	readonly workspaceLabel: string | undefined;
	/** The agent's terminal title, e.g. what omp says it is doing. */
	readonly activity: string | undefined;
}

export type TrustItem =
	| { readonly kind: "blocked"; readonly agent: InboxAgent }
	| { readonly kind: "done"; readonly agent: InboxAgent };

/** Whether the user already marked this agent's current `done` seen (the same state change). */
function isSeen(agent: InboxAgent, seen: SeenDone): boolean {
	return Object.hasOwn(seen, agent.name) && seen[agent.name] === (agent.seq ?? null);
}

/** Inbox view of the snapshot's agents (named like `liveAgents`). */
export function inboxAgents(snapshot: SessionSnapshot | null): InboxAgent[] {
	if (!snapshot) return [];
	const labels = new Map(snapshot.workspaces.map((ws) => [ws.workspace_id, ws.label]));
	return snapshot.agents.map((agent) => ({
		name: agent.name ?? `${agent.agent}-${agent.pane_id.replace(":", "-")}`,
		paneId: agent.pane_id,
		status: agent.agent_status,
		seq: agent.state_change_seq,
		workspaceLabel: labels.get(agent.workspace_id),
		// omp titles read `π > Send greeting message to Ava`: drop the prompt glyph.
		activity: agent.terminal_title_stripped?.replace(/^\S{1,3}\s*>\s+/u, "") || undefined,
	}));
}

/**
 * What needs the user: every blocked agent, then every finished agent whose
 * `done` has not been seen yet. Each group is sorted by name.
 */
export function trustInbox(agents: readonly InboxAgent[], seen: SeenDone): TrustItem[] {
	const byName = (a: InboxAgent, b: InboxAgent): number => a.name.localeCompare(b.name);
	const blocked = agents.filter((agent) => agent.status === "blocked").sort(byName);
	const done = agents
		.filter((agent) => agent.status === "done" && !isSeen(agent, seen))
		.sort(byName);
	return [
		...blocked.map((agent) => ({ kind: "blocked" as const, agent })),
		...done.map((agent) => ({ kind: "done" as const, agent })),
	];
}
