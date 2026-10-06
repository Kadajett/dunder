import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import type { CostToday } from "@shared/office-stats";
import { SessionTail } from "../omp/session-tail";
import { addToDays, costOnDay, dayKey, parseCostLine } from "./cost-entries";

const log = createLogger("office-stats");

const POLL_MS = 5_000;

interface TrackedSession {
	readonly tail: SessionTail;
	readonly days: Map<string, number>;
}

/**
 * Today's AI cost across the office: every omp session log an office agent
 * has used since the app started, read incrementally from its first line.
 * Sessions stay counted after their agent leaves, so respawns keep their spend.
 */
export class CostTracker {
	readonly #sessions = new Map<string, TrackedSession>();
	readonly #onChange: (cost: CostToday) => void;
	readonly #now: () => number;
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

	/** Pick up the session logs of every omp agent in the office. */
	update(snapshot: SessionSnapshot): void {
		let added = false;
		for (const agent of snapshot.agents) {
			const path = agent.agent === "omp" ? agent.agent_session?.value : undefined;
			if (!path || this.#sessions.has(path)) continue;
			this.#sessions.set(path, { tail: new SessionTail(path, "start"), days: new Map() });
			added = true;
		}
		if (added) void this.poll();
	}

	current(): CostToday {
		if (this.#sessions.size === 0) {
			return { state: "unavailable", reason: "no omp session logs in the office yet" };
		}
		const day = dayKey(this.#now());
		const days = [...this.#sessions.values()].map((session) => session.days);
		return { state: "ok", day, usd: costOnDay(days, day), sessions: this.#sessions.size };
	}

	async poll(): Promise<void> {
		if (this.#polling) return;
		this.#polling = true;
		try {
			for (const { tail, days } of this.#sessions.values()) {
				const lines = await tail.lines().catch((error: unknown) => {
					log.warn("cannot read session log", { path: tail.path, error });
					return [];
				});
				addToDays(
					days,
					lines.flatMap((line) => parseCostLine(line) ?? []),
				);
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
