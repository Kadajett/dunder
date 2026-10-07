import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { type CostToday, SPEND_WINDOW_MINUTES } from "@shared/office-stats";
import { SessionTail } from "../omp/session-tail";
import {
	addToDays,
	agentSpends,
	type CostEntry,
	costOnDay,
	dayKey,
	keepRecent,
	parseCostLine,
	spendInSpan,
} from "./cost-entries";

const log = createLogger("office-stats");

const POLL_MS = 5_000;
const WINDOW_MS = SPEND_WINDOW_MINUTES * 60_000;

interface TrackedSession {
	readonly tail: SessionTail;
	agent: string | undefined;
	readonly days: Map<string, number>;
	recent: readonly CostEntry[];
	/** Every priced turn read so far, oldest first: what a bead's time span is priced from. */
	readonly all: CostEntry[];
}

/**
 * Today's AI cost across the office: every omp session log an office agent
 * has used since the app started, read incrementally from its first line.
 * Sessions stay counted after their agent leaves, so respawns keep their
 * spend. Each session is credited to the agent that last used it, which
 * gives the per-agent spend and the runaway-spend alarm's window.
 */
export class CostTracker {
	readonly #sessions = new Map<string, TrackedSession>();
	readonly #onChange: (cost: CostToday) => void;
	readonly #now: () => number;
	#untracked: readonly string[] = [];
	#timer: NodeJS.Timeout | undefined;
	#polling = false;
	#emitted = "";

	constructor(onChange: (cost: CostToday) => void, now: () => number = Date.now) {
		this.#onChange = onChange;
		this.#now = now;
	}

	start(): void {
		this.#timer ??= setInterval(() => void this.poll(), POLL_MS);
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	/** Pick up the session logs of every omp agent in the office, and who is on another harness. */
	update(snapshot: SessionSnapshot): void {
		let added = false;
		for (const agent of snapshot.agents) {
			const path = agent.agent === "omp" ? agent.agent_session?.value : undefined;
			if (!path) continue;
			const known = this.#sessions.get(path);
			if (known) {
				known.agent = agent.name ?? known.agent;
				continue;
			}
			const tail = new SessionTail(path, "start");
			this.#sessions.set(path, { tail, agent: agent.name, days: new Map(), recent: [], all: [] });
			added = true;
		}
		this.#untracked = snapshot.agents
			.flatMap((agent) => (agent.agent !== "omp" && agent.name ? [agent.name] : []))
			.sort();
		if (added) void this.poll();
		else this.#emit();
	}

	current(): CostToday {
		if (this.#sessions.size === 0) {
			return { state: "unavailable", reason: "no omp session logs in the office yet" };
		}
		const now = this.#now();
		const day = dayKey(now);
		const sessions = [...this.#sessions.values()];
		return {
			state: "ok",
			day,
			usd: costOnDay(
				sessions.map((session) => session.days),
				day,
			),
			sessions: this.#sessions.size,
			agents: agentSpends(sessions, day, now - WINDOW_MS),
			untracked: this.#untracked,
		};
	}

	/**
	 * What `agent` spent from `from` to `to` (epoch ms) across the sessions it
	 * last used; null when no omp session is known for it (another harness, or
	 * not in the office).
	 */
	spendBetween(agent: string, from: number, to: number): number | null {
		return spendInSpan([...this.#sessions.values()], agent, from, to);
	}

	async poll(): Promise<void> {
		if (this.#polling) return;
		this.#polling = true;
		try {
			const since = this.#now() - WINDOW_MS;
			for (const session of this.#sessions.values()) {
				const lines = await session.tail.lines().catch((error: unknown) => {
					log.warn("cannot read session log", { path: session.tail.path, error });
					return [];
				});
				const entries = lines.flatMap((line) => parseCostLine(line) ?? []);
				addToDays(session.days, entries);
				session.recent = keepRecent(session.recent, entries, since);
				session.all.push(...entries);
			}
		} finally {
			this.#polling = false;
		}
		this.#emit();
	}

	#emit(): void {
		const cost = this.current();
		const serialized = JSON.stringify(cost);
		if (serialized === this.#emitted) return;
		this.#emitted = serialized;
		this.#onChange(cost);
	}
}
