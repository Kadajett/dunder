import type { AgentInfo, PaneInfo, SessionSnapshot, WorkspaceInfo } from "../schema";

/** Test builders for office-session snapshots. Pane ids look like `w1:p2` (workspace w1, tab w1:t1). */

export function workspace(workspaceId: string, label: string): WorkspaceInfo {
	return {
		workspace_id: workspaceId,
		label,
		number: 1,
		focused: false,
		agent_status: "idle",
		pane_count: 1,
		tab_count: 1,
		active_tab_id: `${workspaceId}:t1`,
	};
}

export function pane(paneId: string, tabId?: string): PaneInfo {
	const workspaceId = paneId.split(":")[0] ?? paneId;
	return {
		pane_id: paneId,
		tab_id: tabId ?? `${workspaceId}:t1`,
		workspace_id: workspaceId,
		terminal_id: `term-${paneId}`,
		focused: false,
		agent_status: "unknown",
		agent: undefined,
		label: undefined,
		cwd: "/work",
		foreground_cwd: "/work",
		terminal_title_stripped: undefined,
		agent_session: undefined,
	};
}

export function agent(name: string, paneId: string, sessionPath?: string): AgentInfo {
	return {
		...pane(paneId),
		agent: "omp",
		agent_status: "idle",
		name,
		agent_session: sessionPath === undefined ? undefined : { kind: "path", value: sessionPath },
	};
}

export function snapshot(parts: {
	readonly workspaces?: readonly WorkspaceInfo[];
	readonly panes?: readonly PaneInfo[];
	readonly agents?: readonly AgentInfo[];
}): SessionSnapshot {
	const agents = [...(parts.agents ?? [])];
	return {
		version: "test",
		protocol: 1,
		workspaces: [...(parts.workspaces ?? [])],
		tabs: [],
		panes: [...(parts.panes ?? []), ...agents],
		agents,
	};
}
