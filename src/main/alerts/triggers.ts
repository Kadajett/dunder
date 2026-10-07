import type { AlertTarget } from "@shared/alerts";
import { agentActivity, agentName } from "@shared/herdr/agent-label";
import type { AgentInfo } from "@shared/herdr/schema";
import { askSnoozeKey, blockedSnoozeKey } from "@shared/inbox-snooze";
import type { HumanAsk } from "@shared/work-board";

/** Triggers this close together become one notification. */
export const BATCH_MS = 30_000;
/** Longest notification body line. */
const BODY_MAX = 120;

/** Something that needs Jeremy: an agent turned blocked, or a new ask. */
export interface AlertItem {
	readonly who: string;
	/** The ask, or what the blocked agent was doing. */
	readonly text: string;
	readonly target: AlertTarget;
	/** The inbox item's snooze key: a snoozed item never alerts. */
	readonly snoozeKey: string;
}

/** The alert for a blocked agent. */
export function blockedItem(agent: AgentInfo): AlertItem {
	return {
		who: agentName(agent),
		text: agentActivity(agent) ?? "is waiting on you",
		target: { kind: "blocked", paneId: agent.pane_id },
		snoozeKey: blockedSnoozeKey(agentName(agent)),
	};
}

/** The alert for an ask. */
export function askItem(ask: HumanAsk): AlertItem {
	return {
		who: ask.asker ?? "An agent",
		text: ask.question,
		target: { kind: "ask", id: ask.id },
		snoozeKey: askSnoozeKey(ask.id),
	};
}

/** What has been seen so far; null until the first reading, which only primes it. */
export interface Seen {
	readonly blocked: ReadonlySet<string> | null;
	readonly asks: ReadonlySet<string> | null;
}

export const NOTHING_SEEN: Seen = { blocked: null, asks: null };

/** Agents that turned blocked since the last snapshot. Those blocked at startup never count. */
export function blockedTriggers(
	seen: Seen,
	agents: readonly AgentInfo[],
): { readonly seen: Seen; readonly items: AlertItem[] } {
	const blocked = agents.filter((agent) => agent.agent_status === "blocked");
	const now = new Set(blocked.map((agent) => agent.pane_id));
	const before = seen.blocked;
	const fresh = before === null ? [] : blocked.filter((agent) => !before.has(agent.pane_id));
	const items = fresh.map(blockedItem);
	return { seen: { ...seen, blocked: now }, items };
}

/** Asks not seen before in this app run. Asks open at startup never count. */
export function askTriggers(
	seen: Seen,
	asks: readonly HumanAsk[],
): { readonly seen: Seen; readonly items: AlertItem[] } {
	const before = seen.asks;
	const all = new Set([...(before ?? []), ...asks.map((ask) => ask.id)]);
	const fresh = before === null ? [] : asks.filter((ask) => !before.has(ask.id));
	const items = fresh.map(askItem);
	return { seen: { ...seen, asks: all }, items };
}

/** Items waiting in one notification, and when its window opened. */
export interface Batch {
	readonly items: readonly AlertItem[];
	readonly openedAt: number;
}

/**
 * Add triggers to the open batch, or open a new one once the last is older
 * than BATCH_MS. `fresh`: a new batch, so it chimes (at most once per batch).
 */
export function addToBatch(
	batch: Batch | null,
	items: readonly AlertItem[],
	now: number,
): { readonly batch: Batch; readonly fresh: boolean } {
	if (batch && now - batch.openedAt < BATCH_MS)
		return { batch: { ...batch, items: [...batch.items, ...items] }, fresh: false };
	return { batch: { items, openedAt: now }, fresh: true };
}

const clip = (text: string) => (text.length > BODY_MAX ? `${text.slice(0, BODY_MAX - 1)}…` : text);

/** The notification for a batch: one item by name and text, several by count and names. */
export function batchNotice(items: readonly AlertItem[]): {
	readonly title: string;
	readonly body: string;
} {
	const [first] = items;
	if (items.length === 1 && first)
		return { title: `${first.who} needs you`, body: clip(first.text) };
	const names = [...new Set(items.map((item) => item.who))];
	return { title: `${items.length} things need you`, body: clip(names.join(", ")) };
}
