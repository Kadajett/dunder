import { type HerdrEvent, type SessionSnapshot, sessionSnapshotSchema } from "@shared/herdr/schema";
import type { BridgeStatus } from "@shared/ipc";
import { z } from "zod";
import type { HerdrApi } from "./api-client";
import { createEventStream, type EventStream } from "./event-stream";

const snapshotResultSchema = z.object({ snapshot: sessionSnapshotSchema });

export async function fetchSnapshot(api: Pick<HerdrApi, "call">): Promise<SessionSnapshot> {
	return snapshotResultSchema.parse(await api.call("session.snapshot")).snapshot;
}

export interface OfficeBridgeListener {
	snapshot(snapshot: SessionSnapshot): void;
	event(event: HerdrEvent): void;
	status(status: BridgeStatus): void;
}

/**
 * Keeps a live view of the office session: an initial snapshot, then a
 * debounced re-snapshot whenever herdr reports a change. Snapshots are the
 * source of truth; events are forwarded for the activity feed.
 */
export class OfficeBridge {
	readonly #api: HerdrApi;
	readonly #listener: OfficeBridgeListener;
	readonly #stream: EventStream;
	#latest: SessionSnapshot | undefined;
	#refreshTimer: NodeJS.Timeout | undefined;

	constructor(api: HerdrApi, listener: OfficeBridgeListener, refreshDelayMs = 120) {
		this.#api = api;
		this.#listener = listener;
		this.#stream = createEventStream({
			api,
			onEvent: (event) => {
				listener.event(event);
				clearTimeout(this.#refreshTimer);
				this.#refreshTimer = setTimeout(() => void this.refresh(), refreshDelayMs);
			},
			onConnectionChange: (connected) => {
				listener.status(connected ? { state: "connected" } : { state: "reconnecting" });
				if (connected) void this.refresh();
			},
		});
	}

	get api(): HerdrApi {
		return this.#api;
	}

	start(): void {
		this.#stream.setPanes([]);
	}

	latest(): SessionSnapshot | undefined {
		return this.#latest;
	}

	async refresh(): Promise<SessionSnapshot | undefined> {
		try {
			const snapshot = await fetchSnapshot(this.#api);
			this.#latest = snapshot;
			this.#stream.setPanes(snapshot.panes.map((pane) => pane.pane_id));
			this.#listener.snapshot(snapshot);
			return snapshot;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.#listener.status({ state: "error", message });
			return undefined;
		}
	}

	stop(): void {
		clearTimeout(this.#refreshTimer);
		this.#stream.close();
	}
}
