import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import type { SeenDone } from "@shared/office-stats";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useCompany } from "../company/company-store";
import { useAppErrors } from "../errors/errors-store";
import { useHumanAsks } from "../work/asks-store";
import { useWorkCards } from "../work/work-store";
import { useCostToday } from "./live-data";
import { runawaySpenders } from "./spend";
import { type InboxAgent, inboxAgents, type TrustItem, trustInbox } from "./trust-inbox";

const log = createLogger("trust-inbox");

/** Seen `done`s: main's saved ones, plus this session's marks (applied here first, so a card hides at once). */
const useSeen = create<{ readonly seen: SeenDone }>(() => ({ seen: {} }));

let loaded = false;

/** Fetch the seen `done`s main kept from earlier runs, once; marks made meanwhile win. */
function loadSeen(): void {
	// A renderer hot-reloaded against an older preload has no `seenDone`.
	if (loaded || !("stats" in window.office) || !("seenDone" in window.office.stats)) return;
	loaded = true;
	window.office.stats.seenDone().then(
		(saved) => useSeen.setState((state) => ({ seen: { ...saved, ...state.seen } })),
		(error: unknown) => log.warn("seen inbox work not loaded", { error }),
	);
}

/** What needs the user right now (Trust Inbox): the live snapshot, app errors, the asks on the work board, runaway spend. */
export function useTrustInbox(snapshot: SessionSnapshot | null): TrustItem[] {
	useEffect(loadSeen, []);
	const seen = useSeen((state) => state.seen);
	const asks = useHumanAsks();
	const errors = useAppErrors((state) => state.errors);
	const cost = useCostToday();
	const threshold = useCompany().spendAlarmUsd;
	const cards = useWorkCards();
	const agents = useMemo(() => inboxAgents(snapshot), [snapshot]);
	const spenders = useMemo(() => runawaySpenders(cost, threshold, cards), [cost, threshold, cards]);
	return useMemo(
		() => trustInbox({ agents, seen, asks, spenders, errors }),
		[agents, seen, asks, spenders, errors],
	);
}

/**
 * Mark one agent's finished work seen: hidden at once and saved by main, so it
 * stays hidden after a restart. herdr is not told (see `OfficeStatsApi.markSeen`).
 */
export function markSeen(agent: InboxAgent): void {
	const seq = agent.seq ?? null;
	useSeen.setState((state) => ({ seen: { ...state.seen, [agent.name]: seq } }));
	if (!("stats" in window.office)) return;
	window.office.stats
		.markSeen(agent.name, seq)
		.catch((error: unknown) =>
			log.warn("seen not saved; it shows again after a restart", { agent: agent.name, error }),
		);
}
