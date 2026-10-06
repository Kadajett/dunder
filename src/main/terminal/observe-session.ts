import { officeArgs } from "../herdr/cli";
import {
	type PaneSize,
	type SpawnHerdr,
	type StreamEvents,
	spawnHerdr,
	startHerdrStream,
} from "./herdr-stream";

export function observeArgs(paneId: string, size: PaneSize): string[] {
	const dims = ["--cols", String(size.cols), "--rows", String(size.rows)];
	return officeArgs(["terminal", "session", "observe", paneId, ...dims]);
}

export interface ObserveSession {
	/** Stop the read-only stream; nothing needs releasing, so this kills at once. */
	stop(): void;
	/** Settles once the process has exited. */
	readonly exited: Promise<void>;
}

export type StartObserve = (paneId: string, size: PaneSize, events: StreamEvents) => ObserveSession;

/**
 * A read-only `terminal session observe` stream. Observing never resizes the
 * pane: herdr renders the pane's screen into a `size` viewport.
 */
export function startObserveSession(
	paneId: string,
	size: PaneSize,
	events: StreamEvents,
	spawnObserve: SpawnHerdr = spawnHerdr,
): ObserveSession {
	const stream = startHerdrStream(observeArgs(paneId, size), events, spawnObserve);
	return { stop: () => stream.stop(0), exited: stream.exited };
}
