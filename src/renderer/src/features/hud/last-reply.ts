import type { AgentReply } from "@shared/agent-replies";
import { createLogger } from "@shared/log/logger";
import { useEffect, useState } from "react";
import type { InboxAgent } from "./trust-inbox";

const log = createLogger("trust-inbox");

/**
 * What a finished agent said last, fetched once per `done` (its state-change
 * seq) when its card shows; main caches by log size, nothing polls. Null
 * while loading, for non-omp agents and for stale replies.
 */
export function useLastReply(agent: InboxAgent): AgentReply | null {
	const { name } = agent;
	const key = `${name}:${agent.seq ?? ""}`;
	const [loaded, setLoaded] = useState<{
		readonly key: string;
		readonly reply: AgentReply | null;
	}>();
	useEffect(() => {
		// A renderer hot-reloaded against an older preload has no `agents`.
		if (!("agents" in window.office)) return;
		let live = true;
		window.office.agents.lastReply(name).then(
			(reply) => {
				if (live) setLoaded({ key, reply });
			},
			(error: unknown) => log.warn("last reply not loaded", { name, error }),
		);
		return () => {
			live = false;
		};
	}, [name, key]);
	return loaded?.key === key ? loaded.reply : null;
}
