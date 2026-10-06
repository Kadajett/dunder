import type { TerminalCommand, TerminalOpenRequest } from "@shared/terminal";
import { officeArgs } from "../herdr/cli";
import {
	type PaneSize,
	type SpawnHerdr,
	type StreamEvents,
	spawnHerdr,
	startHerdrStream,
} from "./herdr-stream";

/** Time herdr gets to honour `terminal.release` before the process is killed. */
const RELEASE_GRACE_MS = 1_000;

export function controlArgs(request: TerminalOpenRequest): string[] {
	const size = ["--cols", String(request.cols), "--rows", String(request.rows)];
	const takeover = request.takeover ? ["--takeover"] : [];
	return officeArgs(["terminal", "session", "control", request.paneId, ...size, ...takeover]);
}

export interface ControlSession {
	send(command: TerminalCommand): void;
	/**
	 * Release the pane politely, then stop the process. `restore` resizes the
	 * pane back first, because herdr leaves a released pane at the last
	 * controller's size.
	 */
	close(restore?: PaneSize): void;
}

/** An interactive `terminal session control` stream for one pane. */
export function startControlSession(
	request: TerminalOpenRequest,
	events: StreamEvents,
	spawnControl: SpawnHerdr = spawnHerdr,
): ControlSession {
	const stream = startHerdrStream(controlArgs(request), events, spawnControl);
	let closing = false;
	return {
		send: (command) => {
			if (!closing) stream.send(command);
		},
		close(restore) {
			if (closing) return;
			closing = true;
			if (restore) stream.send({ type: "terminal.resize", ...restore });
			stream.send({ type: "terminal.release" });
			stream.stop(RELEASE_GRACE_MS);
		},
	};
}
