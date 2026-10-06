import type { ScreenState, ScreenStatus } from "@shared/screens";
import type { PaneSize, TerminalFrame } from "./herdr-stream";
import type { ObserveSession, StartObserve } from "./observe-session";
import type { ResolvePaneSize } from "./pane-size";
import type { ScreenSink } from "./screen-sink";

export interface ObserveOptions {
	readonly start: StartObserve;
	readonly resolveSize: ResolvePaneSize;
	/** How long a stream outlives its last subscriber. */
	readonly lingerMs: number;
	readonly retryInitialMs: number;
	readonly retryMaxMs: number;
	/** Bytes kept since the last full repaint for late joiners; beyond it, re-attach instead. */
	readonly replayLimitBytes: number;
}

/** herdr's terminal.closed reason when the pane no longer exists: retrying is pointless. */
const PANE_GONE = /not found/i;

/**
 * One pane's shared observe process and its subscribers. Every (re)attach
 * starts with herdr's full repaint, delivered with `reset`. A subscriber that
 * joins a running stream gets the bytes since the last full repaint as a reset
 * replay, so joining never restarts the process.
 */
export class ObservedPane {
	readonly paneId: string;
	readonly #options: ObserveOptions;
	readonly #onStopped: (pane: ObservedPane) => void;
	readonly #subscribers = new Map<string, ScreenSink>();
	#session: ObserveSession | undefined;
	/** Bumped on every attach and stop; callbacks from older processes are ignored. */
	#generation = 0;
	/** An attach is starting, live, or waiting to retry. */
	#running = false;
	/** The current attach has delivered its first (full) frame. */
	#attached = false;
	#replay: TerminalFrame[] | undefined;
	#replayBytes = 0;
	/** The size the current process observes at. */
	#size: PaneSize | undefined;
	#status: ScreenStatus;
	#failures = 0;
	#lingerTimer: NodeJS.Timeout | undefined;
	#retryTimer: NodeJS.Timeout | undefined;

	constructor(paneId: string, options: ObserveOptions, onStopped: (pane: ObservedPane) => void) {
		this.paneId = paneId;
		this.#options = options;
		this.#onStopped = onStopped;
		this.#status = { kind: "observe", id: paneId, state: "connecting" };
	}

	get running(): boolean {
		return this.#session !== undefined;
	}

	join(key: string, sink: ScreenSink): void {
		if (this.#subscribers.has(key)) return;
		this.#subscribers.set(key, sink);
		clearTimeout(this.#lingerTimer);
		this.#lingerTimer = undefined;
		if (!this.#running) {
			this.#attach();
			return;
		}
		sink.status(this.#status);
		if (this.#attached) this.#replayTo(sink);
	}

	leave(key: string, immediate: boolean): void {
		if (!this.#subscribers.delete(key) || this.#subscribers.size > 0) return;
		if (immediate) this.stop();
		else this.#lingerTimer ??= setTimeout(() => this.stop(), this.#options.lingerMs);
	}

	/** Subscriber keys held by one window. */
	keysOwnedBy(ownerId: number): string[] {
		return [...this.#subscribers]
			.filter(([, sink]) => sink.ownerId === ownerId)
			.map(([key]) => key);
	}

	/** Re-attach at the pane's current size if it changed since this stream attached. */
	refresh(): void {
		if (!this.#session) return;
		const generation = this.#generation;
		void this.#options.resolveSize(this.paneId).then((size) => {
			const current = this.#size;
			if (generation !== this.#generation || !current) return;
			if (size.cols === current.cols && size.rows === current.rows) return;
			this.#session?.stop();
			this.#attach();
		});
	}

	/** Kill the process now; resolves once it has exited. */
	stop(): Promise<void> {
		const exited = this.#session?.exited ?? Promise.resolve();
		this.#session?.stop();
		this.#reset();
		this.#running = false;
		this.#subscribers.clear();
		this.#onStopped(this);
		return exited;
	}

	#reset(): void {
		this.#generation += 1;
		this.#session = undefined;
		this.#attached = false;
		this.#replay = undefined;
		clearTimeout(this.#lingerTimer);
		clearTimeout(this.#retryTimer);
		this.#lingerTimer = undefined;
		this.#retryTimer = undefined;
	}

	#attach(): void {
		this.#reset();
		const generation = this.#generation;
		this.#running = true;
		this.#setStatus("connecting");
		void this.#options.resolveSize(this.paneId).then((size) => {
			if (generation !== this.#generation) return;
			this.#size = size;
			this.#session = this.#options.start(this.paneId, size, {
				onFrame: (frame) => this.#onFrame(generation, frame),
				onClosed: (reason) => this.#onClosed(generation, reason),
			});
		});
	}

	#onFrame(generation: number, frame: TerminalFrame): void {
		if (generation !== this.#generation) return;
		const reset = !this.#attached;
		if (reset) {
			this.#attached = true;
			this.#failures = 0;
			this.#setStatus("live");
		}
		this.#remember(frame, reset);
		for (const sink of new Set(this.#subscribers.values())) {
			sink.write("observe", this.paneId, frame, reset);
		}
	}

	#onClosed(generation: number, reason: string): void {
		if (generation !== this.#generation) return;
		this.#reset();
		if (this.#subscribers.size === 0) {
			void this.stop();
			return;
		}
		if (PANE_GONE.test(reason)) {
			this.#running = false;
			this.#setStatus("closed", reason);
			return;
		}
		const { retryInitialMs, retryMaxMs } = this.#options;
		const delay = Math.min(retryMaxMs, retryInitialMs * 2 ** this.#failures);
		this.#failures += 1;
		this.#setStatus("disconnected", reason);
		this.#retryTimer = setTimeout(() => this.#attach(), delay);
	}

	#remember(frame: TerminalFrame, reset: boolean): void {
		if (reset || frame.full) {
			this.#replay = [frame];
			this.#replayBytes = frame.data.byteLength;
			return;
		}
		if (!this.#replay) return;
		this.#replay.push(frame);
		this.#replayBytes += frame.data.byteLength;
		if (this.#replayBytes > this.#options.replayLimitBytes) this.#replay = undefined;
	}

	#replayTo(sink: ScreenSink): void {
		if (!this.#replay) {
			// Too much history to replay: a fresh attach repaints every subscriber.
			this.#session?.stop();
			this.#attach();
			return;
		}
		this.#replay.forEach((frame, index) => {
			sink.write("observe", this.paneId, frame, index === 0);
		});
	}

	#setStatus(state: ScreenState, reason?: string): void {
		this.#status = { kind: "observe", id: this.paneId, state, ...(reason ? { reason } : {}) };
		for (const sink of new Set(this.#subscribers.values())) sink.status(this.#status);
	}
}
