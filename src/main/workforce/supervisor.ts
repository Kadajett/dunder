import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Roster } from "@shared/company/roster";
import {
	activeAgents,
	adoptLiveAgents,
	findByName,
	fireAgent,
	hireAgent,
	type NewAgent,
	syncSessions,
	updateAgent,
} from "@shared/company/roster-ops";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { type ChiefSeed, ensureChief } from "./chief";
import { harnessArgs, resumeRef } from "./harness";
import {
	afterFailure,
	MISSING_GRACE_MS,
	planSpawns,
	type SpawnAttempts,
	type SpawnPlan,
	trackMissing,
} from "./plan";
import { agentPrompt } from "./prompt";
import { loadRoster, saveRoster } from "./roster-store";
import { executeSpawn, liveAgentNames, type OfficeCli, reclaimStartedAgent } from "./spawner";

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
	/** Role → markdown brief appended after "Who you are", for roles that have one. */
	readonly rolePrompts?: Readonly<Record<string, string>>;
}

export interface SupervisorDeps {
	readonly rosterPath: string;
	readonly spawn: SpawnConfig;
	readonly cli: OfficeCli;
	readonly sessionExists: (path: string) => boolean;
	readonly onChange: (roster: Roster) => void;
	readonly now: () => number;
	readonly newId: () => string;
	/** Hired into the roster on the first reconcile when it has no chief of staff. */
	readonly chief?: ChiefSeed;
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

	/** Put a new worker on the roster; it starts on the next reconcile, without a grace wait. */
	async hire(input: NewAgent): Promise<void> {
		if (!this.#roster) throw new Error("the workforce is still starting");
		const now = this.#deps.now();
		await this.#commit(hireAgent(this.#roster, input, new Date(now), this.#deps.newId()));
		this.respawnSoon(input.name);
	}

	/** Let a roster worker go for good. False when the name is not on the roster. */
	async fire(name: string): Promise<boolean> {
		const agent = this.#roster && findByName(this.#roster, name);
		if (!this.#roster || !agent) return false;
		if (agent.firedAt === undefined) {
			await this.#commit(fireAgent(this.#roster, agent.id, new Date(this.#deps.now())));
		}
		this.#missingSince.delete(name);
		this.#attempts.delete(name);
		return true;
	}

	/** Respawn this worker as soon as it is absent, skipping the grace period and any backoff. */
	respawnSoon(name: string): void {
		this.#missingSince.set(name, this.#deps.now() - MISSING_GRACE_MS);
		this.#attempts.delete(name);
		this.#kick();
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
		if (this.#deps.chief)
			roster = ensureChief(roster, this.#deps.chief, new Date(now), this.#deps.newId);
		roster = syncSessions(roster, snapshot);
		if (roster !== current || this.#adoptPending) await this.#commit(roster);
		this.#adoptPending = false;
		this.#observe(roster, snapshot, now);
		const resumable = new Map(
			activeAgents(roster).flatMap((agent) => {
				const ref = resumeRef(agent, this.#deps.sessionExists);
				return ref === undefined ? [] : [[agent.name, ref] as const];
			}),
		);
		const plans = planSpawns({
			roster,
			snapshot,
			now,
			missingSince: this.#missingSince,
			attempts: this.#attempts,
			resumable,
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

	/** Fresh each spawn, so protocol and role edits reach the next start. Returns the text. */
	async #writePrompt(plan: SpawnPlan): Promise<string> {
		const protocol = await readFile(this.#deps.spawn.protocolPath, "utf8");
		const briefPath = this.#deps.spawn.rolePrompts?.[plan.agent.role];
		const brief = briefPath === undefined ? undefined : await readFile(briefPath, "utf8");
		const prompt = agentPrompt(protocol, plan.agent, brief);
		await mkdir(dirname(plan.promptPath), { recursive: true });
		await writeFile(plan.promptPath, prompt, "utf8");
		return prompt;
	}

	async #spawn(plan: SpawnPlan): Promise<void> {
		const { name, harness } = plan.agent;
		try {
			// The snapshot may lag; never start a second copy of a live worker.
			if ((await liveAgentNames(this.#deps.cli)).has(name)) return;
			const prompt = await this.#writePrompt(plan);
			const { promptPath, resume } = plan;
			const args = harnessArgs({ agent: plan.agent, promptPath, prompt, resume });
			const resuming = resume ? ` resuming ${resume}` : "";
			console.info(`[workforce] starting ${name}: ${harness}${resuming}`);
			await executeSpawn(this.#deps.cli, plan, args, {
				env: this.#deps.spawn.paneEnv,
				onPane: (paneId) => this.#lastPane.set(name, paneId),
			});
			this.#attempts.delete(name);
			console.info(`[workforce] ${name} is back at ${this.#lastPane.get(name)}`);
		} catch (error) {
			const paneId = this.#lastPane.get(name);
			const reclaimed =
				paneId !== undefined &&
				(await reclaimStartedAgent(this.#deps.cli, paneId, name, harness).catch(() => false));
			if (reclaimed) {
				this.#attempts.delete(name);
				console.warn(`[workforce] ${name} is up but held at startup:`, describe(error));
				return;
			}
			const next = afterFailure(this.#attempts.get(name), this.#deps.now());
			this.#attempts.set(name, next);
			// A reused pane that refused the harness is not a bare shell after all.
			if (plan.target.kind === "reuse") this.#lastPane.delete(name);
			console.warn(
				`[workforce] ${name} failed to start (attempt ${next.failures}):`,
				describe(error),
			);
		}
	}
}
