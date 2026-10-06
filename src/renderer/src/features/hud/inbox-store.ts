import type { SessionSnapshot } from "@shared/herdr/schema";
import { useMemo } from "react";
import { create } from "zustand";
import { type InboxAgent, inboxAgents, seenKey, type TrustItem, trustInbox } from "./trust-inbox";

interface InboxState {
	/** `done`s the user saw here; hidden right away, before herdr's snapshot catches up. */
	readonly seen: ReadonlySet<string>;
	/** Why herdr refused the last mark-seen, by agent name. */
	readonly errors: Readonly<Record<string, string>>;
	hide(key: string, name: string): void;
	restore(key: string, name: string, reason: string): void;
}

const useInbox = create<InboxState>((set) => ({
	seen: new Set(),
	errors: {},
	hide: (key, name) =>
		set((state) => {
			const { [name]: _cleared, ...errors } = state.errors;
			return { seen: new Set(state.seen).add(key), errors };
		}),
	restore: (key, name, reason) =>
		set((state) => {
			const seen = new Set(state.seen);
			seen.delete(key);
			return { seen, errors: { ...state.errors, [name]: reason } };
		}),
}));

/** What needs the user right now (Trust Inbox), from the live snapshot. */
export function useTrustInbox(snapshot: SessionSnapshot | null): TrustItem[] {
	const seen = useInbox((state) => state.seen);
	const agents = useMemo(() => inboxAgents(snapshot), [snapshot]);
	return useMemo(() => trustInbox(agents, seen), [agents, seen]);
}

/** Why marking this agent's work seen last failed, if it did. */
export function useSeenError(name: string): string | undefined {
	return useInbox((state) => state.errors[name]);
}

/**
 * Mark an agent's finished work as seen: hidden at once, and herdr is told
 * (`agent focus`) so its `done` clears everywhere. Back in the inbox, with
 * the reason, if herdr refuses.
 */
export async function markSeen(agent: InboxAgent): Promise<void> {
	const key = seenKey(agent.name, agent.seq);
	const { hide, restore } = useInbox.getState();
	hide(key, agent.name);
	if (!("stats" in window.office)) return;
	const result = await window.office.stats.markSeen(agent.name);
	if (!result.ok) restore(key, agent.name, result.reason);
}
