import type { AgentStatus } from "@shared/herdr/schema";
import type { ModelOption } from "@shared/models";

export type ModelCheck =
	| { readonly ok: true; readonly option: ModelOption }
	| { readonly ok: false; readonly reason: string };

/** Accept only catalog selectors, with a thinking level that model supports. */
export function checkModelRequest(
	catalog: readonly ModelOption[],
	selector: string,
	thinking: string | undefined,
): ModelCheck {
	const option = catalog.find((model) => model.selector === selector);
	if (!option) return { ok: false, reason: `unknown model ${selector}` };
	if (thinking === undefined || option.thinking.includes(thinking)) return { ok: true, option };
	const levels = option.thinking.length > 0 ? option.thinking.join(", ") : "none";
	return { ok: false, reason: `${option.name} thinking levels: ${levels} (not ${thinking})` };
}

/** `selector[:thinking]`, the form omp's `--model` and `/switch` both accept. */
export function modelSpec(selector: string, thinking: string | undefined): string {
	return thinking === undefined ? selector : `${selector}:${thinking}`;
}

/**
 * The live-session switch. omp's TUI `/model` ignores arguments and opens a
 * picker; `/switch <selector>[:level]` switches the running session directly.
 */
export function switchCommand(spec: string): string {
	return `/switch ${spec}`;
}

export type Delivery =
	| { readonly kind: "send" }
	| { readonly kind: "wait"; readonly reason: string };

/** Type into an agent only while it waits for a prompt; never into a working or blocked one. */
export function deliveryFor(name: string, status: AgentStatus | undefined): Delivery {
	switch (status) {
		case "idle":
		case "done":
			return { kind: "send" };
		case "working":
			return { kind: "wait", reason: `${name} is working; switching once it is idle` };
		case "blocked":
			return {
				kind: "wait",
				reason: `${name} is waiting on a question; switching once it is idle`,
			};
		default:
			return { kind: "wait", reason: `${name} is not ready; switching once it is idle` };
	}
}
