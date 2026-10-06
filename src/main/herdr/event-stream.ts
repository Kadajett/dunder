import type { HerdrEvent } from "@shared/herdr/schema";
import type { HerdrApi, HerdrSubscription, SubscriptionHandle } from "./api-client";

/** Session-wide events that change the office topology. */
const TOPOLOGY_EVENTS = [
	"workspace.created",
	"workspace.updated",
	"workspace.renamed",
	"workspace.moved",
	"workspace.reordered",
	"workspace.closed",
	"workspace.metadata_updated",
	"tab.created",
	"tab.closed",
	"tab.renamed",
	"tab.moved",
	"pane.created",
	"pane.closed",
	"pane.updated",
	"pane.moved",
	"pane.exited",
	"pane.agent_detected",
	"layout.updated",
] as const;

/**
 * herdr only streams `pane.agent_status_changed` for an explicit pane, so the
 * subscription list grows with the pane set.
 */
export function subscriptionsFor(paneIds: readonly string[]): HerdrSubscription[] {
	return [
		...TOPOLOGY_EVENTS.map((type) => ({ type })),
		...paneIds.map((pane_id) => ({ type: "pane.agent_status_changed", pane_id })),
	];
}

export interface EventStreamOptions {
	readonly api: Pick<HerdrApi, "subscribe">;
	onEvent(event: HerdrEvent): void;
	/** `true` once a (re)subscription is live; callers should resync state then. */
	onConnectionChange(connected: boolean): void;
	readonly retryDelayMs?: number;
}

export interface EventStream {
	/** Resubscribe when the set of panes to watch changes. */
	setPanes(paneIds: readonly string[]): void;
	close(): void;
}

export function createEventStream(options: EventStreamOptions): EventStream {
	const retryDelayMs = options.retryDelayMs ?? 1_000;
	let current: SubscriptionHandle | undefined;
	let paneIds: readonly string[] = [];
	let paneKey: string | undefined;
	let retryTimer: NodeJS.Timeout | undefined;
	let stopped = false;

	function connect(): void {
		clearTimeout(retryTimer);
		const handle = options.api.subscribe(subscriptionsFor(paneIds), {
			onStart: () => options.onConnectionChange(true),
			onEvent: options.onEvent,
			onClose: () => {
				if (stopped || current !== handle) return;
				current = undefined;
				options.onConnectionChange(false);
				retryTimer = setTimeout(connect, retryDelayMs);
			},
		});
		const previous = current;
		current = handle;
		previous?.close();
	}

	return {
		setPanes(next) {
			const key = [...next].sort().join(",");
			if (stopped || (key === paneKey && current)) return;
			paneKey = key;
			paneIds = [...next];
			connect();
		},
		close() {
			stopped = true;
			clearTimeout(retryTimer);
			current?.close();
			current = undefined;
		},
	};
}
