import type { TerminalCommand, TerminalOpenRequest } from "@shared/terminal";
import {
	type ControlSession,
	type ControlSessionEvents,
	startControlSession,
	type TerminalFrame,
} from "./control-session";

/** Where a terminal's output goes (one renderer window). */
export interface TerminalSink {
	readonly ownerId: number;
	frame(terminalId: string, frame: TerminalFrame): void;
	closed(terminalId: string, reason: string): void;
}

export type StartSession = (
	request: TerminalOpenRequest,
	events: ControlSessionEvents,
) => ControlSession;

export const SUPERSEDED_REASON = "opened in another screen";

interface Entry {
	readonly ownerId: number;
	readonly paneId: string;
	readonly sink: TerminalSink;
	/** Commands sent before the control process starts. */
	readonly queued: TerminalCommand[];
	readonly markExited: () => void;
	/** Absent while waiting for the pane's previous screen to exit. */
	session: ControlSession | undefined;
	closeReason: string | undefined;
}

/**
 * Tracks every open screen; each owns one `terminal session control` process.
 * A pane has at most one screen: opening it again closes the previous screen
 * and starts the new process only after the old one has exited, so two of our
 * own processes never race to take over the same pane.
 */
export class TerminalRegistry {
	readonly #entries = new Map<string, Entry>();
	/** The newest screen per pane. */
	readonly #current = new Map<string, string>();
	/** Settles once every screen opened so far on the pane has exited. */
	readonly #tails = new Map<string, Promise<void>>();
	readonly #start: StartSession;
	#counter = 0;

	constructor(start: StartSession = startControlSession) {
		this.#start = start;
	}

	open(request: TerminalOpenRequest, sink: TerminalSink): string {
		this.#counter += 1;
		const terminalId = `screen-${this.#counter}`;
		const previousId = this.#current.get(request.paneId);
		if (previousId) this.#close(previousId, SUPERSEDED_REASON);

		const exited = Promise.withResolvers<void>();
		const entry: Entry = {
			ownerId: sink.ownerId,
			paneId: request.paneId,
			sink,
			queued: [],
			markExited: exited.resolve,
			session: undefined,
			closeReason: undefined,
		};
		this.#entries.set(terminalId, entry);
		this.#current.set(request.paneId, terminalId);
		const ready = this.#tails.get(request.paneId) ?? Promise.resolve();
		this.#tails.set(
			request.paneId,
			ready.then(() => exited.promise),
		);
		void ready.then(() => this.#launch(terminalId, entry, request));
		return terminalId;
	}

	send(terminalId: string, command: TerminalCommand): void {
		const entry = this.#entries.get(terminalId);
		if (entry?.session) entry.session.send(command);
		else entry?.queued.push(command);
	}

	close(terminalId: string): void {
		this.#close(terminalId, "closed");
	}

	closeOwnedBy(ownerId: number): void {
		for (const [terminalId, entry] of this.#entries) {
			if (entry.ownerId === ownerId) this.close(terminalId);
		}
	}

	closeAll(): void {
		for (const terminalId of this.#entries.keys()) this.close(terminalId);
	}

	#launch(terminalId: string, entry: Entry, request: TerminalOpenRequest): void {
		if (!this.#entries.has(terminalId)) return;
		const session = this.#start(request, {
			onFrame: (frame) => entry.sink.frame(terminalId, frame),
			onClosed: (reason) => this.#finish(terminalId, entry, reason),
		});
		entry.session = session;
		for (const command of entry.queued.splice(0)) session.send(command);
	}

	#close(terminalId: string, reason: string): void {
		const entry = this.#entries.get(terminalId);
		if (!entry) return;
		entry.closeReason ??= reason;
		if (entry.session) entry.session.close();
		else this.#finish(terminalId, entry, reason);
	}

	#finish(terminalId: string, entry: Entry, reason: string): void {
		if (!this.#entries.delete(terminalId)) return;
		if (this.#current.get(entry.paneId) === terminalId) this.#current.delete(entry.paneId);
		entry.sink.closed(terminalId, entry.closeReason ?? reason);
		entry.markExited();
	}
}
