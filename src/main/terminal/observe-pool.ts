import { ObservedPane, type ObserveOptions } from "./observed-pane";
import type { ScreenSink } from "./screen-sink";

export const OBSERVE_DEFAULTS = {
	lingerMs: 2_000,
	retryInitialMs: 500,
	retryMaxMs: 10_000,
	replayLimitBytes: 1024 * 1024,
} as const;

export type ObservePoolOptions = Pick<ObserveOptions, "start" | "resolveSize"> &
	Partial<ObserveOptions>;

/**
 * Read-only observe streams, one process per pane, reference-counted by
 * subscriber. Subscribers are namespaced by window (`sink.ownerId`), and both
 * subscribe and unsubscribe are idempotent, so React StrictMode's
 * mount/unmount/mount never spawns or kills a process.
 */
export class ObservePool {
	readonly #panes = new Map<string, ObservedPane>();
	readonly #options: ObserveOptions;

	constructor(options: ObservePoolOptions) {
		this.#options = { ...OBSERVE_DEFAULTS, ...options };
	}

	subscribe(sink: ScreenSink, subscriberId: string, paneId: string): void {
		let pane = this.#panes.get(paneId);
		if (!pane) {
			pane = new ObservedPane(paneId, this.#options, (stopped) => {
				if (this.#panes.get(stopped.paneId) === stopped) this.#panes.delete(stopped.paneId);
			});
			this.#panes.set(paneId, pane);
		}
		pane.join(`${sink.ownerId}/${subscriberId}`, sink);
	}

	unsubscribe(ownerId: number, subscriberId: string, paneId: string): void {
		this.#panes.get(paneId)?.leave(`${ownerId}/${subscriberId}`, false);
	}

	/** A window went away: its subscriptions end and orphaned streams stop at once. */
	dropOwner(ownerId: number): void {
		for (const pane of [...this.#panes.values()]) {
			for (const key of pane.keysOwnedBy(ownerId)) pane.leave(key, true);
		}
	}

	/** The pane may have been resized: re-attach its stream if its size changed. */
	refresh(paneId: string): void {
		this.#panes.get(paneId)?.refresh();
	}

	/** Panes whose observe process is running (diagnostics and tests). */
	runningPanes(): string[] {
		return [...this.#panes.values()].filter((pane) => pane.running).map((pane) => pane.paneId);
	}

	/** Kill every observe process; resolves once all have exited. */
	async shutdown(): Promise<void> {
		await Promise.all([...this.#panes.values()].map((pane) => pane.stop()));
	}
}
