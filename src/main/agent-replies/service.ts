import { stat } from "node:fs/promises";
import type { AgentReply } from "@shared/agent-replies";
import type { AgentStatus, SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { lastTurnReply, readTail } from "./last-reply";

const log = createLogger("agent-replies");

/** A reply this much older than the turn's observed start still counts (clock and snapshot lag). */
const TURN_SLACK_MS = 5_000;

interface Watched {
	readonly session: string;
	readonly status: AgentStatus;
	/** When main saw this agent start working last; undefined until it has. */
	readonly turnStartedAt: number | undefined;
}

/**
 * Live omp agents' final replies for the Trust Inbox, read from the end of
 * their session logs when a card asks (never polled) and cached until the
 * log's size changes. A reply older than the turn main last saw start is stale.
 */
export class AgentRepliesService {
	readonly #now: () => number;
	#agents = new Map<string, Watched>();
	readonly #cache = new Map<string, { readonly key: string; readonly reply: AgentReply | null }>();

	constructor(now: () => number = Date.now) {
		this.#now = now;
	}

	update(snapshot: SessionSnapshot): void {
		const next = new Map<string, Watched>();
		for (const agent of snapshot.agents) {
			const session = agent.agent_session;
			if (!agent.name || agent.agent !== "omp" || session?.kind !== "path") continue;
			const before = this.#agents.get(agent.name);
			const started = agent.agent_status === "working" && before?.status !== "working";
			next.set(agent.name, {
				session: session.value,
				status: agent.agent_status,
				turnStartedAt: started ? this.#now() : before?.turnStartedAt,
			});
		}
		this.#agents = next;
	}

	async lastReply(name: string): Promise<AgentReply | null> {
		const agent = this.#agents.get(name);
		if (!agent) return null;
		const reply = await this.#read(name, agent.session);
		const startedAt = agent.turnStartedAt;
		if (reply && startedAt !== undefined && reply.at < startedAt - TURN_SLACK_MS) return null;
		return reply;
	}

	async #read(name: string, session: string): Promise<AgentReply | null> {
		try {
			const key = `${session}:${(await stat(session)).size}`;
			const cached = this.#cache.get(name);
			if (cached?.key === key) return cached.reply;
			const tail = await readTail(session);
			const reply = lastTurnReply(tail.lines);
			this.#cache.set(name, { key: `${session}:${tail.size}`, reply });
			return reply;
		} catch (error) {
			// A session log that moved or vanished (agent restarted): the card keeps its activity line.
			log.debug("session log unreadable", { name, session, error });
			return null;
		}
	}
}
