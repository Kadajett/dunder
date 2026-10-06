import type { ScreenState } from "@shared/screens";
import type { TerminalCommand, TerminalOpenRequest } from "@shared/terminal";
import { type ControlSession, startControlSession } from "./control-session";
import type { PaneSize, StreamEvents } from "./herdr-stream";
import type { ResolvePaneSize } from "./pane-size";
import type { ScreenSink } from "./screen-sink";

export type StartSession = (request: TerminalOpenRequest, events: StreamEvents) => ControlSession;

export const SUPERSEDED_REASON = "opened in another screen";
export const CLOSED_REASON = "closed";

interface Entry {
	readonly paneId: string;
	readonly sink: ScreenSink;
	/** Commands sent before the control process starts. */
	readonly queued: TerminalCommand[];
	readonly markExited: () => void;
	/** Absent while waiting for the pane's previous screen to exit. */
	session: ControlSession | undefined;
	closeReason: string | undefined;
	/** The pane's size before this screen resized it; restored on release. */
	home: PaneSize | undefined;
	/** Size of the latest frame (the pane's PTY size); absent until the first frame. */
	size: PaneSize | undefined;
}

export interface RegistryOptions {
	readonly start?: StartSession;
	/** Size to put the pane back to on release; omit to leave it at the screen's size. */
	readonly homeSize?: ResolvePaneSize;
	/** A screen changed the pane's PTY size (attach, resize, or release). */
	readonly onPaneResized?: (paneId: string) => void;
}

/**
 * Tracks every interactive screen; each owns one `terminal session control`
 * process. A pane has at most one screen: opening it again closes the previous
 * screen and starts the new process only after the old one has exited, so two
 * of our own processes never race to take over the same pane.
 */
export class TerminalRegistry {
	readonly #entries = new Map<string, Entry>();
	/** The newest screen per pane. */
	readonly #current = new Map<string, string>();
	/** Settles once every screen opened so far on the pane has exited. */
	readonly #tails = new Map<string, Promise<void>>();
	readonly #start: StartSession;
	readonly #homeSize: ResolvePaneSize | undefined;
	readonly #onPaneResized: ((paneId: string) => void) | undefined;
	#counter = 0;

	constructor(options: RegistryOptions = {}) {
		this.#start = options.start ?? startControlSession;
		this.#homeSize = options.homeSize;
		this.#onPaneResized = options.onPaneResized;
	}

	open(request: TerminalOpenRequest, sink: ScreenSink): string {
		this.#counter += 1;
		const terminalId = `screen-${this.#counter}`;
		const previousId = this.#current.get(request.paneId);
		if (previousId) this.#close(previousId, SUPERSEDED_REASON);

		const exited = Promise.withResolvers<void>();
		this.#entries.set(terminalId, {
			paneId: request.paneId,
			sink,
			queued: [],
			markExited: exited.resolve,
			session: undefined,
			closeReason: undefined,
			home: undefined,
			size: undefined,
		});
		this.#current.set(request.paneId, terminalId);
		this.#status(sink, terminalId, "connecting");
		const ready = this.#tails.get(request.paneId) ?? Promise.resolve();
		this.#tails.set(
			request.paneId,
			ready.then(() => exited.promise),
		);
		const home = this.#homeSize?.(request.paneId) ?? Promise.resolve(undefined);
		void Promise.all([home, ready]).then(([size]) => this.#launch(terminalId, request, size));
		return terminalId;
	}

	/** The window that opened a screen. */
	ownerOf(terminalId: string): number | undefined {
		return this.#entries.get(terminalId)?.sink.ownerId;
	}

	/** Whether the pane has an interactive screen (Jeremy has it open in terminal focus). */
	isOpen(paneId: string): boolean {
		return this.#current.has(paneId);
	}

	send(terminalId: string, command: TerminalCommand): void {
		const entry = this.#entries.get(terminalId);
		if (entry?.session) entry.session.send(command);
		else entry?.queued.push(command);
	}

	close(terminalId: string): void {
		this.#close(terminalId, CLOSED_REASON);
	}

	closeOwnedBy(ownerId: number): void {
		for (const [terminalId, entry] of this.#entries) {
			if (entry.sink.ownerId === ownerId) this.close(terminalId);
		}
	}

	/** Release every screen; resolves once all control processes have exited. */
	async shutdown(): Promise<void> {
		for (const terminalId of this.#entries.keys()) this.close(terminalId);
		await Promise.all(this.#tails.values());
	}

	#launch(terminalId: string, request: TerminalOpenRequest, home: PaneSize | undefined): void {
		const entry = this.#entries.get(terminalId);
		if (!entry) return;
		entry.home = home;
		const session = this.#start(request, {
			onFrame: (frame) => {
				const reset = entry.size === undefined;
				if (reset) this.#status(entry.sink, terminalId, "live");
				if (reset || entry.size?.cols !== frame.cols || entry.size.rows !== frame.rows) {
					entry.size = { cols: frame.cols, rows: frame.rows };
					this.#onPaneResized?.(entry.paneId);
				}
				entry.sink.write("control", terminalId, frame, reset);
			},
			onClosed: (reason) => this.#finish(terminalId, reason),
		});
		entry.session = session;
		for (const command of entry.queued.splice(0)) session.send(command);
	}

	#close(terminalId: string, reason: string): void {
		const entry = this.#entries.get(terminalId);
		if (!entry) return;
		entry.closeReason ??= reason;
		if (!entry.session) {
			this.#finish(terminalId, reason);
			return;
		}
		// A superseding screen resizes the pane itself; restoring in between would only flicker.
		entry.session.close(reason === SUPERSEDED_REASON ? undefined : entry.home);
	}

	#finish(terminalId: string, reason: string): void {
		const entry = this.#entries.get(terminalId);
		if (!entry) return;
		this.#entries.delete(terminalId);
		if (this.#current.get(entry.paneId) === terminalId) this.#current.delete(entry.paneId);
		this.#status(entry.sink, terminalId, "closed", entry.closeReason ?? reason);
		entry.markExited();
		if (entry.size) this.#onPaneResized?.(entry.paneId);
	}

	#status(sink: ScreenSink, terminalId: string, state: ScreenState, reason?: string): void {
		sink.status({ kind: "control", id: terminalId, state, ...(reason ? { reason } : {}) });
	}
}
