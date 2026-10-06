import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { WORKOUT_SECONDS, type Workout, type WorkoutReason } from "@shared/calisthenics";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { officeArgs, runHerdr } from "../herdr/cli";
import { type CoachDeps, type CompactionExpectation, coachAgent } from "./coach";
import { CompactionWatch, hasConversation } from "./compaction-watch";
import { isDailyDue, localDateKey } from "./schedule";
import { type CalisthenicsSettings, loadSettings, saveSettings } from "./settings";

const log = createLogger("calisthenics");

/** A workout counts as running until everyone has had time to walk back to their desk. */
const ACTIVE_MS = (WORKOUT_SECONDS + 20) * 1_000;
const SCHEDULE_CHECK_MS = 30_000;
const PROMPT_TIMEOUT_MS = 20_000;

export interface CalisthenicsDeps {
	/** `<userData>/calisthenics.json`. */
	readonly settingsPath: string;
	/** Tell every window a workout started. */
	publish(workout: Workout): void;
	/** `herdr --session office agent prompt <agent> <text>`. */
	prompt(agent: string, text: string): Promise<void>;
}

const isGroup = (reason: WorkoutReason): boolean => reason !== "compaction";

/**
 * The office's exercise coach: a daily (or bell-rung) group workout that also
 * compacts every omp agent and has it re-read its memory, plus a solo workout
 * whenever an agent compacts on its own.
 */
export class Calisthenics {
	readonly #deps: CalisthenicsDeps;
	readonly #watch = new CompactionWatch((agent) => this.#onCompaction(agent));
	readonly #expected = new Map<string, (compacted: boolean) => void>();
	#settings: Promise<CalisthenicsSettings> = Promise.resolve({ dailyTime: "15:00" });
	#snapshot: SessionSnapshot | undefined;
	#workouts: Workout[] = [];
	#timer: NodeJS.Timeout | undefined;
	#checking = false;

	constructor(deps: CalisthenicsDeps) {
		this.#deps = deps;
	}

	start(): void {
		this.#settings = loadSettings(this.#deps.settingsPath);
		// Write the normalised file back so the daily time is easy to find and change.
		void this.#settings.then((settings) => saveSettings(this.#deps.settingsPath, settings));
		this.#watch.start();
		this.#timer = setInterval(() => void this.#checkSchedule(), SCHEDULE_CHECK_MS);
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#watch.stop();
		for (const resolve of this.#expected.values()) resolve(false);
		this.#expected.clear();
	}

	/** Latest office state: who is here, their status and session logs. */
	update(snapshot: SessionSnapshot): void {
		this.#snapshot = snapshot;
		const sessions = new Map<string, string>();
		for (const agent of snapshot.agents) {
			if (agent.name && agent.agent === "omp" && agent.agent_session?.kind === "path") {
				sessions.set(agent.name, agent.agent_session.value);
			}
		}
		this.#watch.track(sessions);
	}

	active(): readonly Workout[] {
		const now = Date.now();
		this.#workouts = this.#workouts.filter((workout) => now - workout.startedAt < ACTIVE_MS);
		return this.#workouts;
	}

	/** The wall bell. A second ring during a group workout is ignored. */
	startNow(): Workout | undefined {
		return this.startWorkout("manual", this.#participants());
	}

	startWorkout(reason: WorkoutReason, agents: readonly string[]): Workout | undefined {
		if (agents.length === 0) return undefined;
		const running = this.active();
		if (isGroup(reason) && running.some((workout) => isGroup(workout.reason))) return undefined;
		if (
			!isGroup(reason) &&
			running.some((workout) => agents.some((a) => workout.agents.includes(a)))
		)
			return undefined;
		const workout: Workout = { id: randomUUID(), reason, startedAt: Date.now(), agents };
		this.#workouts.push(workout);
		this.#deps.publish(workout);
		log.info("workout started", { reason, agents });
		if (isGroup(reason)) void this.#coachAll(agents);
		return workout;
	}

	/** Everyone named and not waiting on the human. */
	#participants(): string[] {
		return (this.#snapshot?.agents ?? []).flatMap((agent) =>
			agent.name && agent.agent_status !== "blocked" ? [agent.name] : [],
		);
	}

	async #coachAll(agents: readonly string[]): Promise<void> {
		const agentNamed = (name: string) => this.#snapshot?.agents.find((a) => a.name === name);
		const deps: CoachDeps = {
			statusOf: (name) => agentNamed(name)?.agent_status,
			prompt: (name, text) => this.#deps.prompt(name, text),
			canCompact: async (name) => {
				const session = agentNamed(name)?.agent_session;
				return session?.kind === "path" && (await hasConversation(session.value));
			},
			expectCompaction: (name, timeoutMs) => this.#expectCompaction(name, timeoutMs),
			sleep: (ms) => delay(ms),
			now: Date.now,
		};
		const coached = agents.filter((name) => agentNamed(name)?.agent === "omp");
		await Promise.all(
			coached.map(async (name) => {
				log.info("agent coached", { agent: name, ...(await coachAgent(name, deps)) });
			}),
		);
	}

	#expectCompaction(agent: string, timeoutMs: number): CompactionExpectation {
		this.#expected.get(agent)?.(false);
		const { promise, resolve } = Promise.withResolvers<boolean>();
		const settle = (compacted: boolean): void => {
			clearTimeout(timer);
			if (this.#expected.get(agent) === settle) this.#expected.delete(agent);
			resolve(compacted);
		};
		const timer = setTimeout(() => settle(false), timeoutMs);
		this.#expected.set(agent, settle);
		return { done: promise, cancel: () => settle(false) };
	}

	#onCompaction(agent: string): void {
		const expected = this.#expected.get(agent);
		if (expected) {
			expected(true);
			return;
		}
		// The agent compacted on its own: a short solo stretch.
		this.startWorkout("compaction", [agent]);
	}

	async #checkSchedule(): Promise<void> {
		if (this.#checking) return;
		this.#checking = true;
		try {
			const settings = await this.#settings;
			const now = new Date();
			const agents = this.#participants();
			if (!isDailyDue(now, settings.dailyTime, settings.lastRunDate) || agents.length === 0) return;
			const next = { ...settings, lastRunDate: localDateKey(now) };
			this.#settings = Promise.resolve(next);
			await saveSettings(this.#deps.settingsPath, next);
			this.startWorkout("daily", agents);
		} catch (error) {
			log.warn("daily check failed", { error });
		} finally {
			this.#checking = false;
		}
	}
}

/** The coach for the running app: settings in `userDataDir`, prompts via the herdr CLI. */
export function createCalisthenics(
	userDataDir: string,
	publish: (workout: Workout) => void,
): Calisthenics {
	return new Calisthenics({
		settingsPath: join(userDataDir, "calisthenics.json"),
		publish,
		prompt: async (agent, text) => {
			await runHerdr(officeArgs(["agent", "prompt", agent, text]), PROMPT_TIMEOUT_MS);
		},
	});
}
