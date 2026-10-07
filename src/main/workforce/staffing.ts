import type { Harness } from "@shared/company/roster";
import { checkHire, type HarnessCheck, type WorkforceResult } from "@shared/company/workforce";
import { createLogger } from "@shared/log/logger";
import type { ModelOption } from "@shared/models";
import { EXIT_COMMAND } from "./harness";
import { type LiveAgentInfo, liveAgents, type OfficeCli } from "./spawner";
import type { WorkforceSupervisor } from "./supervisor";

/** How long a restart waits for a busy worker to finish its turn before giving up. */
const BUSY_WAIT_MS = 120_000;
/** How long an exiting worker gets to leave before ctrl+c, and after it. */
const EXIT_WAIT_MS = 15_000;
const EXIT_POLL_MS = 500;

const log = createLogger("workforce");

export interface StaffingDeps {
	readonly supervisor: Pick<WorkforceSupervisor, "roster" | "hire" | "fire" | "respawnSoon">;
	readonly cli: OfficeCli;
	readonly catalog: () => Promise<readonly ModelOption[]>;
	/** Whether a worker on this harness could answer (CLI there and logged in). */
	readonly checkHarness: (harness: Harness) => Promise<HarnessCheck>;
	readonly isDirectory: (path: string) => Promise<boolean>;
	readonly sleep: (ms: number) => Promise<void>;
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function attempt(work: () => Promise<WorkforceResult>): Promise<WorkforceResult> {
	try {
		return await work();
	} catch (error) {
		return { ok: false, error: describe(error) };
	}
}

/** Hiring, firing and restarting roster workers on top of the supervisor. */
export class Staffing {
	readonly #deps: StaffingDeps;

	constructor(deps: StaffingDeps) {
		this.#deps = deps;
	}

	hire(request: unknown): Promise<WorkforceResult> {
		return attempt(async () => {
			const roster = this.#deps.supervisor.roster();
			if (!roster) return { ok: false, error: "the workforce is still starting" };
			const live = await liveAgents(this.#deps.cli);
			const takenNames = new Set([
				...roster.agents.map((agent) => agent.name),
				...live.flatMap((agent) => (agent.name ? [agent.name] : [])),
			]);
			const catalog = await this.#deps.catalog().catch(() => undefined);
			const check = checkHire(request, catalog ? { takenNames, catalog } : { takenNames });
			if (!check.ok) return check;
			const { hire } = check;
			if (hire.harness === "omp" && hire.model !== undefined && !catalog) {
				return { ok: false, error: "model: omp's model catalog is unavailable right now" };
			}
			const problem = await this.#preflight(hire.cwd, hire.harness);
			if (problem) return { ok: false, error: problem };
			const { model, ...rest } = hire;
			await this.#deps.supervisor.hire(model === undefined ? rest : { ...rest, model });
			return { ok: true };
		});
	}

	/**
	 * Why the new worker couldn't start and answer, or null: its directory
	 * exists, and its harness is installed and logged in. The dev1/dev2 lesson:
	 * never put a worker on the roster that will sit blocked on a login.
	 */
	async #preflight(cwd: string, harness: Harness): Promise<string | null> {
		if (!(await this.#deps.isDirectory(cwd))) return `cwd: ${cwd} is not a directory`;
		const ready = await this.#deps.checkHarness(harness);
		if (ready.state === "not-ready") return `harness: ${ready.reason}`;
		if (ready.state === "unknown")
			log.warn("hiring without a harness check", { harness, reason: ready.reason });
		return null;
	}

	/** Whether a worker on `harness` could answer now: what the hire dialog shows before hiring. */
	checkHarness(harness: Harness): Promise<HarnessCheck> {
		return this.#deps.checkHarness(harness);
	}

	fire(name: string): Promise<WorkforceResult> {
		return attempt(async () => {
			const onRoster = await this.#deps.supervisor.fire(name);
			const live = await this.#find(name);
			if (live?.pane_id) await this.#deps.cli(["pane", "close", live.pane_id]);
			if (!onRoster && !live) return { ok: false, error: `${name} is not in the office` };
			return { ok: true };
		});
	}

	restart(name: string): Promise<WorkforceResult> {
		return attempt(async () => {
			const hired = this.#deps.supervisor.roster()?.agents.find((agent) => agent.name === name);
			if (!hired || hired.firedAt !== undefined) {
				const error = `${name} is not on the roster, so nobody would bring them back`;
				return { ok: false, error };
			}
			const live = await this.#find(name);
			if (live) await this.#exit(name, live);
			this.#deps.supervisor.respawnSoon(name);
			return { ok: true };
		});
	}

	async #find(name: string): Promise<LiveAgentInfo | undefined> {
		return (await liveAgents(this.#deps.cli)).find((agent) => agent.name === name);
	}

	/** Ask the worker to quit between turns; ctrl+c it if it will not; fail if it still stays. */
	async #exit(name: string, live: LiveAgentInfo): Promise<void> {
		const { cli } = this.#deps;
		if (live.agent_status === "working") {
			const wait = ["agent", "wait", name, "--until", "idle", "--until", "done"];
			await cli([...wait, "--timeout", String(BUSY_WAIT_MS)], BUSY_WAIT_MS + 5_000).catch(() => {
				throw new Error(`${name} is still busy; try again when the turn is done`);
			});
		}
		const typed = await cli(["agent", "prompt", name, EXIT_COMMAND]).then(
			() => true,
			() => false,
		);
		if (typed && (await this.#gone(name))) return;
		await cli(["agent", "send-keys", name, "ctrl+c"]).catch(() => undefined);
		await this.#deps.sleep(300);
		await cli(["agent", "send-keys", name, "ctrl+c"]).catch(() => undefined);
		if (!(await this.#gone(name))) throw new Error(`${name} did not exit`);
	}

	async #gone(name: string): Promise<boolean> {
		for (let waited = 0; waited < EXIT_WAIT_MS; waited += EXIT_POLL_MS) {
			if (!(await this.#find(name))) return true;
			await this.#deps.sleep(EXIT_POLL_MS);
		}
		return false;
	}
}
