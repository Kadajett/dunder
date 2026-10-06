import type { TerminalCommand, TerminalOpenRequest } from "@shared/terminal";
import type { ObservePool } from "./observe-pool";
import type { TerminalRegistry } from "./registry";
import type { WindowSink } from "./screen-sink";

/**
 * The stream manager behind `window.office.screens`: observe streams and
 * control screens for every connected window. Windows are identified by
 * `ownerId` (their webContents id); a window only reaches its own screens.
 */
export class ScreensService {
	readonly #observers: ObservePool;
	readonly #controls: TerminalRegistry;
	readonly #sinks = new Map<number, WindowSink>();

	constructor(observers: ObservePool, controls: TerminalRegistry) {
		this.#observers = observers;
		this.#controls = controls;
	}

	/** A (re)loaded window brings a new port: everything the old page held is dropped. */
	connect(sink: WindowSink): void {
		this.disconnect(sink.ownerId);
		this.#sinks.set(sink.ownerId, sink);
	}

	/** The window closed, crashed or reloaded: stop all of its streams now. */
	disconnect(ownerId: number): void {
		this.#observers.dropOwner(ownerId);
		this.#controls.closeOwnedBy(ownerId);
		this.#sinks.get(ownerId)?.dispose();
		this.#sinks.delete(ownerId);
	}

	observe(ownerId: number, subscriberId: string, paneId: string): void {
		const sink = this.#sinks.get(ownerId);
		if (sink) this.#observers.subscribe(sink, subscriberId, paneId);
	}

	unobserve(ownerId: number, subscriberId: string, paneId: string): void {
		this.#observers.unsubscribe(ownerId, subscriberId, paneId);
	}

	open(ownerId: number, request: TerminalOpenRequest): string {
		const sink = this.#sinks.get(ownerId);
		if (!sink) throw new Error("this window has no screens port yet");
		return this.#controls.open(request, sink);
	}

	send(ownerId: number, terminalId: string, command: TerminalCommand): void {
		if (this.#controls.ownerOf(terminalId) === ownerId) this.#controls.send(terminalId, command);
	}

	close(ownerId: number, terminalId: string): void {
		if (this.#controls.ownerOf(terminalId) === ownerId) this.#controls.close(terminalId);
	}

	/** App quit: release every screen and kill every observe; resolves when all exited. */
	async shutdown(): Promise<void> {
		for (const sink of this.#sinks.values()) sink.dispose();
		this.#sinks.clear();
		await Promise.all([this.#observers.shutdown(), this.#controls.shutdown()]);
	}
}
