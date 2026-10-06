import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Roster } from "@shared/company/roster";
import {
	activeAgents,
	adoptLiveAgents,
	findByName,
	syncSessions,
	updateAgent,
} from "@shared/company/roster-ops";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { afterFailure, planSpawns, type SpawnAttempts, type SpawnPlan, trackMissing } from "./plan";
import { agentPrompt } from "./prompt";
import { loadRoster, saveRoster } from "./roster-store";
import { executeSpawn, liveAgentNames, type OfficeCli } from "./spawner";

/** Re-check on a timer too: grace periods and backoffs expire without any herdr event. */
const TICK_MS = 5_000;

/** What every (re)spawned worker starts with. */
export interface SpawnConfig {
	/** Directory for each worker's appended system prompt. */
	readonly promptDir: string;
	/** The shared office protocol every worker's prompt starts with. */
	readonly protocolPath: string;
	/** Environment for the shell panes workers are started in. */
	readonly paneEnv: Readonly<Record<string, string>>;
}

export interface SupervisorDeps {
	readonly rosterPath: string;
	readonly spawn: SpawnConfig;
	readonly cli: OfficeCli;
	readonly sessionExists: (path: string) => boolean;
	readonly onChange: (roster: Roster) => void;
	readonly now: () => number;
	readonly newId: () => string;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Keeps the roster's workers employed: adopts the live staff on first run,
 * tracks each worker's omp session, and respawns roster workers whose agent
 * vanished from the office session. All herdr IO goes through `deps.cli`.
 */
export class WorkforceSupervisor {
	readonly #deps: SupervisorDeps;
	#roster: Roster | undefined;
	#adoptPending = false;
	#snapshot: SessionSnapshot | undefined;
	#missingSince = new Map<string, number>();
	readonly #attempts = new Map<string, SpawnAttempts>();
	readonly #lastPane = new Map<string, string>();
	#running = false;
	#rerun = false;
	#loop: Promise<void> = Promise.resolve();
	#timer: NodeJS.Timeout | undefined;
	/** Saves run one at a time, each writing the latest roster. */
	#saving: Promise<void> = Promise.resolve();

	constructor(deps: SupervisorDeps) {
		this.#deps = deps;
	}

	async start(): Promise<void> {
		const loaded = await loadRoster(this.#deps.rosterPath);
		this.#roster = loaded.roster;
		this.#adoptPending = !loaded.existed;
		this.#deps.onChange(loaded.roster);
		this.#timer = setInterval(() => this.#kick(), TICK_MS);
		this.#timer.unref();
		this.#kick();
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
		this.#snapshot = undefined;
	}

	roster(): Roster | undefined {
		return this.#roster;
	}

	/** Remember the model (`selector[:thinking]`) a worker respawns with. No-op off the roster. */
	async setAgentModel(name: string, model: string): Promise<void> {
		const agent = this.#roster && findByName(this.#roster, name);
		if (!this.#roster || !agent || agent.model === model) return;
		await this.#commit(updateAgent(this.#roster, agent.id, { model }));
	}

	handleSnapshot(snapshot: SessionSnapshot): void {
		this.#snapshot = snapshot;
		this.#kick();
	}

	/** Resolves once every queued reconcile pass has finished. */
	settled(): Promise<void> {
		return this.#loop;
	}

	/** One reconcile at a time; a snapshot arriving mid-run triggers one more pass. */
	#kick(): void {
		if (this.#running) {
			this.#rerun = true;
			return;
		}
		this.#running = true;
		this.#loop = this.#drain();
	}

	async #drain(): Promise<void> {
		do {
			this.#rerun = false;
			await this.#reconcile().catch((error: unknown) =>
				console.warn("[workforce] reconcile failed:", describe(error)),
			);
		} while (this.#rerun);
		this.#running = false;
	}

	async #reconcile(): Promise<void> {
		const snapshot = this.#snapshot;
		const current = this.#roster;
		if (!snapshot || !current) return;
		const now = this.#deps.now();
		let roster = current;
		if (this.#adoptPending)
			roster = adoptLiveAgents(roster, snapshot, new Date(now), this.#deps.newId);
		roster = syncSessions(roster, snapshot);
		if (roster !== current || this.#adoptPending) await this.#commit(roster);
		this.#adoptPending = false;
		this.#observe(roster, snapshot, now);
		const existingSessions = new Set(
			activeAgents(roster).flatMap((a) =>
				a.lastSessionPath && this.#deps.sessionExists(a.lastSessionPath) ? [a.lastSessionPath] : [],
			),
		);
		const plans = planSpawns({
			roster,
			snapshot,
			now,
			missingSince: this.#missingSince,
			attempts: this.#attempts,
			existingSessions,
			lastPane: this.#lastPane,
			promptDir: this.#deps.spawn.promptDir,
		});
		for (const plan of plans) {
			if (this.#snapshot) await this.#spawn(plan);
		}
	}

	async #commit(roster: Roster): Promise<void> {
		this.#roster = roster;
		this.#deps.onChange(roster);
		const save = this.#saving.then(() => saveRoster(this.#deps.rosterPath, this.#roster ?? roster));
		this.#saving = save.catch(() => undefined);
		await save;
	}

	#observe(roster: Roster, snapshot: SessionSnapshot, now: number): void {
		for (const live of snapshot.agents) {
			if (!live.name) continue;
			this.#lastPane.set(live.name, live.pane_id);
			this.#attempts.delete(live.name);
		}
		this.#missingSince = trackMissing(this.#missingSince, roster, snapshot, now);
	}

	/** Fresh each spawn, so protocol and role edits reach the next start. */
	async #writePrompt(plan: SpawnPlan): Promise<void> {
		const protocol = await readFile(this.#deps.spawn.protocolPath, "utf8");
		await mkdir(dirname(plan.promptPath), { recursive: true });
		await writeFile(plan.promptPath, agentPrompt(protocol, plan.agent), "utf8");
	}

	async #spawn(plan: SpawnPlan): Promise<void> {
		const { name } = plan.agent;
		try {
			// The snapshot may lag; never start a second copy of a live worker.
			if ((await liveAgentNames(this.#deps.cli)).has(name)) return;
			await this.#writePrompt(plan);
			console.info(`[workforce] respawning ${name}: omp ${plan.args.join(" ")}`);
			await executeSpawn(this.#deps.cli, plan, {
				env: this.#deps.spawn.paneEnv,
				onPane: (paneId) => this.#lastPane.set(name, paneId),
			});
			this.#attempts.delete(name);
			console.info(`[workforce] ${name} is back at ${this.#lastPane.get(name)}`);
		} catch (error) {
			const next = afterFailure(this.#attempts.get(name), this.#deps.now());
			this.#attempts.set(name, next);
			// A reused pane that refused omp is not a bare shell after all.
			if (plan.target.kind === "reuse") this.#lastPane.delete(name);
			console.warn(
				`[workforce] ${name} failed to start (attempt ${next.failures}):`,
				describe(error),
			);
		}
	}
}
