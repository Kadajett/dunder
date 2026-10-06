import type { Unsubscribe } from "./screens";

/** The model an omp agent is running right now, read from its session log. */
export interface AgentModel {
	/** Provider-qualified selector, e.g. `anthropic/claude-opus-5-5`. */
	readonly model: string | undefined;
	/** Thinking level, e.g. `high`; undefined when the session never set one. */
	readonly thinking: string | undefined;
	/** A switch requested from the UI that has not shown up in the session yet. */
	readonly pending?: { readonly model: string; readonly thinking: string | undefined };
}

/** One chat model omp can run. */
export interface ModelOption {
	readonly selector: string;
	readonly name: string;
	readonly provider: string;
	/** Supported thinking levels; empty when the model has no reasoning control. */
	readonly thinking: readonly string[];
	readonly contextWindow: number;
}

export type SetModelResult =
	| { readonly state: "applied" }
	| { readonly state: "queued"; readonly reason: string }
	| { readonly state: "rejected"; readonly reason: string };

/** `window.office.models`. Keyed by live agent name. */
export interface ModelsApi {
	catalog(): Promise<readonly ModelOption[]>;
	live(): Promise<Readonly<Record<string, AgentModel>>>;
	onLive(listener: (models: Readonly<Record<string, AgentModel>>) => void): Unsubscribe;
	setModel(
		agentName: string,
		selector: string,
		thinking: string | undefined,
	): Promise<SetModelResult>;
}

/** Short label for tags: `anthropic/claude-opus-5-5` → `opus 5.5`. */
export function shortModelName(selector: string | undefined): string {
	if (!selector) return "default model";
	const id = selector.split("/").at(-1) ?? selector;
	return id
		.replace(/^claude-/, "")
		.replace(/-(\d+)-(\d+)$/, " $1.$2")
		.replace(/-(\d+(?:\.\d+)?)$/, " $1")
		.replace(/-/g, " ");
}
