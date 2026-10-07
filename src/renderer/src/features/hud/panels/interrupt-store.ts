import type { AgentStatus } from "@shared/herdr/schema";
import { create } from "zustand";

/** Where an interrupt of one agent is. */
export type InterruptState =
	/** Asking Jeremy to confirm (with an optional reason). */
	| { readonly phase: "confirm" }
	| { readonly phase: "sending" }
	/** Stopped and asked to report; shown until that report turn is over. */
	| { readonly phase: "interrupted"; readonly sawWorking: boolean }
	| { readonly phase: "failed"; readonly reason: string };

/**
 * The agent's status moved: an interrupted agent stays marked while it writes
 * its report (working), and the mark goes once that turn ends.
 */
export function afterStatus(
	state: InterruptState | undefined,
	status: AgentStatus,
): InterruptState | undefined {
	if (state?.phase !== "interrupted") return state;
	if (status === "working") return state.sawWorking ? state : { ...state, sawWorking: true };
	const finished = status === "idle" || status === "done" || status === "blocked";
	return state.sawWorking && finished ? undefined : state;
}

export const useInterrupts = create<{ readonly byName: Readonly<Record<string, InterruptState>> }>(
	() => ({
		byName: {},
	}),
);

function set(name: string, state: InterruptState | undefined): void {
	useInterrupts.setState(({ byName }) => {
		const { [name]: _old, ...rest } = byName;
		return { byName: state ? { ...rest, [name]: state } : rest };
	});
}

export const askInterrupt = (name: string) => set(name, { phase: "confirm" });
export const cancelInterrupt = (name: string) => set(name, undefined);

/** Each agent's status as its card last saw it (the snapshot can lag the real stop and restart). */
const lastStatus = new Map<string, AgentStatus>();

export function noteStatus(name: string, status: AgentStatus): void {
	lastStatus.set(name, status);
	const current = useInterrupts.getState().byName[name];
	const next = afterStatus(current, status);
	if (next !== current) set(name, next);
}

/** Interrupt it now; main stops the turn, prompts it and tells Max. */
export async function interrupt(name: string, reason: string): Promise<void> {
	if (!("agents" in window.office)) return;
	set(name, { phase: "sending" });
	const result = await window.office.agents.interrupt(name, reason).catch((error: unknown) => ({
		ok: false as const,
		reason: error instanceof Error ? error.message : String(error),
	}));
	if (!result.ok) {
		set(name, { phase: "failed", reason: result.reason });
		return;
	}
	set(name, { phase: "interrupted", sawWorking: false });
	// The card may still show it working (it is answering, or the snapshot lags): count that,
	// so the mark goes when it next stops either way.
	const status = lastStatus.get(name);
	if (status) noteStatus(name, status);
}
