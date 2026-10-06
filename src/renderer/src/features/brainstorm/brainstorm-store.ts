import type { Brainstorm } from "@shared/brainstorm";
import { createLogger } from "@shared/log/logger";
import { create } from "zustand";

const log = createLogger("brainstorm");

/** The running brainstorm, as main last announced it. */
export const useBrainstormStore = create<{ readonly current: Brainstorm | null }>(() => ({
	current: null,
}));

/** Follow main's brainstorm (App mounts this once); a preload without the API (hot reload) has none. */
export function connectBrainstorm(): () => void {
	if (!("brainstorm" in window.office)) return () => undefined;
	const api = window.office.brainstorm;
	let live = true;
	const off = api.onChanged((current) => useBrainstormStore.setState({ current }));
	api.current().then(
		(current) => live && useBrainstormStore.setState({ current }),
		(error: unknown) => log.warn("brainstorm state not loaded", { error }),
	);
	return () => {
		live = false;
		off();
	};
}

/** The running brainstorm, or null. */
export function useBrainstorm(): Brainstorm | null {
	return useBrainstormStore((state) => state.current);
}

/** Whether `agentName` takes part in the running brainstorm (read outside React, e.g. per frame). */
export function inBrainstorm(agentName: string): boolean {
	return useBrainstormStore.getState().current?.agents.includes(agentName) ?? false;
}

export function startBrainstorm(topic: string): Promise<void> {
	return window.office.brainstorm.start(topic);
}

export function endBrainstorm(): void {
	window.office.brainstorm
		.end()
		.catch((error: unknown) => log.warn("brainstorm not ended", { error }));
}
