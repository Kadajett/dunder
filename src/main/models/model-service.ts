import type { AgentStatus, SessionSnapshot } from "@shared/herdr/schema";
import type { AgentModel, SetModelResult } from "@shared/models";
import { SessionTail } from "../omp/session-tail";
import type { OfficeCli } from "../workforce/spawner";
import type { ModelCatalog } from "./catalog";
import { applyModelLines, NO_SESSION_MODEL, type SessionModel } from "./session-model";
import { checkModelRequest, deliveryFor, modelSpec, switchCommand } from "./switch-plan";

const POLL_MS = 1_000;
/** A sent switch that leaves no model_change by then failed inside omp (e.g. no API key). */
const LAND_TIMEOUT_MS = 60_000;

export interface ModelServiceDeps {
	readonly cli: OfficeCli;
	readonly catalog: ModelCatalog;
	/** Remember the choice for respawns (roster `model`); a no-op for agents not on the roster. */
	readonly persist: (agentName: string, spec: string) => Promise<void>;
	readonly onLive: (live: Readonly<Record<string, AgentModel>>) => void;
}

interface LiveOmp {
	readonly sessionPath: string | undefined;
	readonly status: AgentStatus;
}

/** A requested switch; `baseline` is the session's model_change count when it was sent. */
interface Request {
	readonly model: string;
	readonly thinking: string | undefined;
	readonly baseline: number | undefined;
	readonly sentAt: number;
}

/**
 * Which model every live omp agent runs (followed from its session log), and
 * UI-driven switches: validated against omp's catalog, remembered in the
 * roster, and typed into the agent as `/switch` only while it is idle.
 */
export class ModelService {
	readonly #deps: ModelServiceDeps;
	#agents = new Map<string, LiveOmp>();
	readonly #tails = new Map<string, SessionTail>();
	readonly #models = new Map<string, SessionModel>();
	readonly #requests = new Map<string, Request>();
	#timer: NodeJS.Timeout | undefined;
	#polling = false;
	#emitted = "";

	constructor(deps: ModelServiceDeps) {
		this.#deps = deps;
	}

	start(): void {
		this.#timer ??= setInterval(() => void this.poll(), POLL_MS);
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	live(): Record<string, AgentModel> {
		const live: Record<string, AgentModel> = {};
		for (const name of this.#agents.keys()) {
			const model = this.#models.get(name) ?? NO_SESSION_MODEL;
			const request = this.#requests.get(name);
			live[name] = {
				model: model.model,
				thinking: model.thinking,
				...(request && { pending: { model: request.model, thinking: request.thinking } }),
			};
		}
		return live;
	}

	/** Track the live omp agents and send any switch that was waiting for its agent to go idle. */
	update(snapshot: SessionSnapshot): void {
		this.#agents = new Map(
			snapshot.agents.flatMap((agent) =>
				agent.agent === "omp" && agent.name
					? [[agent.name, { sessionPath: agent.agent_session?.value, status: agent.agent_status }]]
					: [],
			),
		);
		for (const [name, tail] of this.#tails) {
			if (this.#agents.get(name)?.sessionPath === tail.path) continue;
			this.#tails.delete(name);
			this.#models.delete(name);
		}
		for (const [name, { sessionPath }] of this.#agents) {
			if (sessionPath && !this.#tails.has(name)) {
				this.#tails.set(name, new SessionTail(sessionPath, "start"));
			}
		}
		for (const name of this.#requests.keys()) {
			if (!this.#agents.has(name)) this.#requests.delete(name);
		}
		void this.#flushQueued();
		this.#emit();
	}

	async setModel(
		agentName: string,
		selector: string,
		thinking: string | undefined,
	): Promise<SetModelResult> {
		if (!this.#agents.has(agentName)) {
			return { state: "rejected", reason: `${agentName} is not in the office` };
		}
		let check = checkModelRequest(await this.#deps.catalog.list(), selector, thinking);
		// New providers or models appear after `omp models refresh`: look once more before refusing.
		if (!check.ok)
			check = checkModelRequest(await this.#deps.catalog.refresh(), selector, thinking);
		if (!check.ok) return { state: "rejected", reason: check.reason };
		await this.#deps.persist(agentName, modelSpec(selector, thinking));
		this.#requests.set(agentName, { model: selector, thinking, baseline: undefined, sentAt: 0 });
		const result = await this.#deliver(agentName);
		this.#emit();
		return result;
	}

	/** Read new session log lines; a model_change after a sent switch means it landed. */
	async poll(): Promise<void> {
		if (this.#polling) return;
		this.#polling = true;
		try {
			for (const [name, tail] of this.#tails) {
				const lines = await tail.lines();
				if (this.#tails.get(name) !== tail) continue;
				const model = applyModelLines(this.#models.get(name) ?? NO_SESSION_MODEL, lines);
				this.#models.set(name, model);
				const request = this.#requests.get(name);
				if (request?.baseline === undefined) continue;
				if (model.modelChanges > request.baseline) this.#requests.delete(name);
				else if (Date.now() - request.sentAt > LAND_TIMEOUT_MS) {
					console.warn(`[models] ${name} never switched to ${request.model}`);
					this.#requests.delete(name);
				}
			}
		} finally {
			this.#polling = false;
		}
		this.#emit();
	}

	async #deliver(name: string): Promise<SetModelResult> {
		const request = this.#requests.get(name);
		if (!request) return { state: "rejected", reason: `no switch requested for ${name}` };
		const delivery = deliveryFor(name, this.#agents.get(name)?.status);
		if (delivery.kind === "wait") return { state: "queued", reason: delivery.reason };
		const baseline = (this.#models.get(name) ?? NO_SESSION_MODEL).modelChanges;
		this.#requests.set(name, { ...request, baseline, sentAt: Date.now() });
		try {
			const command = switchCommand(modelSpec(request.model, request.thinking));
			await this.#deps.cli(["agent", "prompt", name, command]);
			return { state: "applied" };
		} catch (error) {
			this.#requests.delete(name);
			const message = error instanceof Error ? error.message : String(error);
			return { state: "rejected", reason: `could not reach ${name}: ${message}` };
		}
	}

	async #flushQueued(): Promise<void> {
		for (const [name, request] of this.#requests) {
			if (request.baseline !== undefined) continue;
			const result = await this.#deliver(name);
			if (result.state === "rejected") {
				console.warn(`[models] queued switch for ${name} dropped: ${result.reason}`);
			}
		}
		this.#emit();
	}

	#emit(): void {
		const live = this.live();
		const serialized = JSON.stringify(live);
		if (serialized === this.#emitted) return;
		this.#emitted = serialized;
		this.#deps.onLive(live);
	}
}
