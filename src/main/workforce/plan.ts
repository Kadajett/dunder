import { join } from "node:path";
import type { Roster, RosterAgent } from "@shared/company/roster";
import { activeAgents } from "@shared/company/roster-ops";
import type { SessionSnapshot } from "@shared/herdr/schema";

/** How long a roster worker must be absent before it is respawned (rides out omp restarts). */
export const MISSING_GRACE_MS = 8_000;
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_MAX_MS = 10 * 60_000;
/** A tab holding this many panes is full; the next worker gets a new tab. */
export const MAX_PANES_PER_TAB = 4;

/** Where a respawned worker's shell pane comes from. */
export type PaneTarget =
	| { readonly kind: "reuse"; readonly paneId: string }
	| { readonly kind: "split"; readonly paneId: string }
	| { readonly kind: "tab"; readonly workspaceId: string }
	| { readonly kind: "workspace"; readonly label: string };

export interface SpawnPlan {
	readonly agent: RosterAgent;
	readonly target: PaneTarget;
	/** omp arguments after `--`. */
	readonly args: readonly string[];
	/** Where the shell writes the worker's appended system prompt before starting it. */
	readonly promptPath: string;
}

export interface SpawnAttempts {
	readonly failures: number;
	readonly retryAt: number;
}

export interface PlanInput {
	readonly roster: Roster;
	readonly snapshot: SessionSnapshot;
	readonly now: number;
	/** When each absent worker was first seen missing (see `trackMissing`). */
	readonly missingSince: ReadonlyMap<string, number>;
	readonly attempts: ReadonlyMap<string, SpawnAttempts>;
	/** Session files that still exist on disk. */
	readonly existingSessions: ReadonlySet<string>;
	/** Pane each worker last occupied; reused when it is back at a bare shell. */
	readonly lastPane: ReadonlyMap<string, string>;
	/** Directory holding each worker's appended system prompt, `<name>.md`. */
	readonly promptDir: string;
}

/**
 * Every worker runs in yolo mode with the office protocol appended to its
 * system prompt, resuming its last session when the file survives.
 */
export function ompArgs(
	agent: RosterAgent,
	existingSessions: ReadonlySet<string>,
	promptPath: string,
): string[] {
	const args = ["--approval-mode=yolo", `--append-system-prompt=${promptPath}`];
	if (agent.model !== undefined) args.push(`--model=${agent.model}`);
	const session = agent.lastSessionPath;
	if (session !== undefined && existingSessions.has(session)) args.push(`--resume=${session}`);
	return args;
}

/** Exponential backoff after a failed start: 10 s, 20 s, 40 s … capped at 10 min. */
export function afterFailure(previous: SpawnAttempts | undefined, now: number): SpawnAttempts {
	const failures = (previous?.failures ?? 0) + 1;
	const delay = Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
	return { failures, retryAt: now + delay };
}

/** Update when each active worker went missing; present workers drop out of the map. */
export function trackMissing(
	previous: ReadonlyMap<string, number>,
	roster: Roster,
	snapshot: SessionSnapshot,
	now: number,
): Map<string, number> {
	const live = new Set(snapshot.agents.flatMap((a) => (a.name ? [a.name] : [])));
	const next = new Map<string, number>();
	for (const agent of activeAgents(roster)) {
		if (!live.has(agent.name)) next.set(agent.name, previous.get(agent.name) ?? now);
	}
	return next;
}

function isDue(input: PlanInput, name: string): boolean {
	const since = input.missingSince.get(name);
	if (since === undefined || input.now - since < MISSING_GRACE_MS) return false;
	return (input.attempts.get(name)?.retryAt ?? 0) <= input.now;
}

function chooseTarget(
	input: PlanInput,
	agent: RosterAgent,
	claimed: ReadonlySet<string>,
): PaneTarget {
	const { snapshot } = input;
	const workspace = snapshot.workspaces.find((ws) => ws.label === agent.workspaceLabel);
	if (!workspace) return { kind: "workspace", label: agent.workspaceLabel };
	const panes = snapshot.panes.filter((p) => p.workspace_id === workspace.workspace_id);
	const last = panes.find((p) => p.pane_id === input.lastPane.get(agent.name));
	if (last && last.agent === undefined && !claimed.has(last.pane_id)) {
		return { kind: "reuse", paneId: last.pane_id };
	}
	const tabId = workspace.active_tab_id ?? panes[0]?.tab_id;
	const inTab = panes.filter((p) => p.tab_id === tabId);
	const host = inTab[0];
	if (host && inTab.length < MAX_PANES_PER_TAB && !claimed.has(host.pane_id)) {
		return { kind: "split", paneId: host.pane_id };
	}
	return { kind: "tab", workspaceId: workspace.workspace_id };
}

function claimKey(target: PaneTarget): string {
	switch (target.kind) {
		case "reuse":
		case "split":
			return target.paneId;
		case "tab":
			return `tab:${target.workspaceId}`;
		case "workspace":
			return `workspace:${target.label}`;
	}
}

/**
 * Which missing roster workers to start now, and where. Fired workers are
 * never planned. At most one worker per pane, new tab or new workspace per
 * round: the layout those create is only known from the next snapshot.
 */
export function planSpawns(input: PlanInput): SpawnPlan[] {
	const claimed = new Set<string>();
	const plans: SpawnPlan[] = [];
	for (const agent of activeAgents(input.roster)) {
		if (!isDue(input, agent.name)) continue;
		const target = chooseTarget(input, agent, claimed);
		const key = claimKey(target);
		if (claimed.has(key)) continue;
		claimed.add(key);
		const promptPath = join(input.promptDir, `${agent.name}.md`);
		const args = ompArgs(agent, input.existingSessions, promptPath);
		plans.push({ agent, target, args, promptPath });
	}
	return plans;
}
