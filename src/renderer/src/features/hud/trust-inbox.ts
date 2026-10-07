import type { AppError } from "@shared/app-errors";
import { agentActivity, agentName } from "@shared/herdr/agent-label";
import type { AgentStatus, SessionSnapshot } from "@shared/herdr/schema";
import { askSnoozeKey, blockedSnoozeKey, type Snooze } from "@shared/inbox-snooze";
import type { SeenDone } from "@shared/office-stats";
import type { HumanAsk } from "@shared/work-board";
import type { Spender } from "./spend";

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
	/** The app itself hit an error (a crashed region, an uncaught exception, a library's console error). */
	| { readonly kind: "error"; readonly error: AppError }
	/** Something an agent flagged that only Jeremy can do or decide (a bd `human` bead). */
	| { readonly kind: "ask"; readonly ask: HumanAsk }
	/** An agent spending more than the company's alarm in the last 30 minutes. */
	| { readonly kind: "spend"; readonly agent: InboxAgent; readonly spender: Spender }
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
		name: agentName(agent),
		paneId: agent.pane_id,
		status: agent.agent_status,
		seq: agent.state_change_seq,
		workspaceLabel: labels.get(agent.workspace_id),
		activity: agentActivity(agent),
	}));
}

/** Everything the Trust Inbox draws from. */
export interface InboxSources {
	readonly agents: readonly InboxAgent[];
	readonly seen: SeenDone;
	readonly asks?: readonly HumanAsk[];
	readonly spenders?: readonly Spender[];
	/** The app's own errors, newest first (main dedupes repeats). */
	readonly errors?: readonly AppError[];
}

/**
 * What needs the user: every blocked agent (sorted by name), then the app's
 * own errors (newest first), then the asks agents flagged for him (in main's
 * order: most urgent, then oldest), then agents spending fast (fastest
 * first), then every finished agent whose `done` has not been seen yet (by name).
 */
export function trustInbox({
	agents,
	seen,
	asks = [],
	spenders = [],
	errors = [],
}: InboxSources): TrustItem[] {
	const byName = (a: InboxAgent, b: InboxAgent): number => a.name.localeCompare(b.name);
	const blocked = agents.filter((agent) => agent.status === "blocked").sort(byName);
	const done = agents
		.filter((agent) => agent.status === "done" && !isSeen(agent, seen))
		.sort(byName);
	const spending = spenders.flatMap((spender) => {
		const agent = agents.find((candidate) => candidate.name === spender.name);
		return agent ? [{ kind: "spend" as const, agent, spender }] : [];
	});
	return [
		...blocked.map((agent) => ({ kind: "blocked" as const, agent })),
		...errors.map((error) => ({ kind: "error" as const, error })),
		...asks.map((ask) => ({ kind: "ask" as const, ask })),
		...spending,
		...done.map((agent) => ({ kind: "done" as const, agent })),
	];
}

/** The key an item snoozes under: asks by bead id, blocked agents by name; other kinds don't snooze. */
export function snoozeKeyOf(item: TrustItem): string | null {
	if (item.kind === "ask") return askSnoozeKey(item.ask.id);
	if (item.kind === "blocked") return blockedSnoozeKey(item.agent.name);
	return null;
}

/** A snoozed item and when it comes back. */
export interface SnoozedItem {
	readonly item: TrustItem;
	readonly until: number;
}

/** The inbox without its snoozed items (`awake`), and those items with their return time. */
export function splitSnoozed(
	items: readonly TrustItem[],
	snoozes: readonly Snooze[],
): { readonly awake: TrustItem[]; readonly snoozed: SnoozedItem[] } {
	const until = new Map(snoozes.map((snooze) => [snooze.key, snooze.until]));
	const awake: TrustItem[] = [];
	const snoozed: SnoozedItem[] = [];
	for (const item of items) {
		const at = until.get(snoozeKeyOf(item) ?? "");
		if (at === undefined) awake.push(item);
		else snoozed.push({ item, until: at });
	}
	return { awake, snoozed };
}
