import type {
	ScreenChunk,
	ScreenPortMessage,
	ScreenStatus,
	ScreenStreamKind,
	ScreensApi,
	Unsubscribe,
} from "@shared/screens";

export interface ScreenListener {
	chunk(chunk: ScreenChunk): void;
	status(status: ScreenStatus): void;
}

/** Per-window demultiplexer over `ScreensApi.onMessage`. */
export interface ScreenClient {
	/**
	 * Joins a pane's observe stream. The first listener for a pane calls
	 * `api.observe`, the last one to leave calls `api.unobserve`, so any number of
	 * monitors/tiles share one subscription. The latest known status is replayed to a
	 * new listener synchronously. The returned function is idempotent.
	 */
	observe(paneId: string, listener: ScreenListener): Unsubscribe;
	/** Receives a control session's traffic (no subscription side effects). Idempotent. */
	control(terminalId: string, listener: ScreenListener): Unsubscribe;
}

const keyOf = (kind: ScreenStreamKind, id: string): string => `${kind}\u0000${id}`;

interface Channel {
	readonly listeners: Set<ScreenListener>;
	status: ScreenStatus | undefined;
}

/** `subscriberId` must be stable for the window's lifetime (it identifies this client to main). */
export function createScreenClient(api: ScreensApi, subscriberId: string): ScreenClient {
	const channels = new Map<string, Channel>();
	let detach: Unsubscribe | undefined;

	const deliverStatus = (status: ScreenStatus): void => {
		const channel = channels.get(keyOf(status.kind, status.id));
		if (!channel) return;
		channel.status = status;
		for (const listener of channel.listeners) listener.status(status);
	};

	const dispatch = (message: ScreenPortMessage): void => {
		if (message.type === "status") {
			deliverStatus(message.status);
			return;
		}
		for (const chunk of message.chunks) {
			const channel = channels.get(keyOf(chunk.kind, chunk.id));
			if (channel) for (const listener of channel.listeners) listener.chunk(chunk);
		}
	};

	/** Returns true when this listener opened the channel. */
	const join = (key: string, listener: ScreenListener): boolean => {
		// Attach before main is asked to observe, so no early traffic is missed.
		detach ??= api.onMessage(dispatch);
		const existing = channels.get(key);
		if (existing) {
			existing.listeners.add(listener);
			if (existing.status) listener.status(existing.status);
			return false;
		}
		channels.set(key, { listeners: new Set([listener]), status: undefined });
		return true;
	};

	/** Returns true when this listener closed the channel. */
	const leave = (key: string, listener: ScreenListener): boolean => {
		const channel = channels.get(key);
		if (!channel?.listeners.delete(listener) || channel.listeners.size > 0) return false;
		channels.delete(key);
		if (channels.size === 0) {
			detach?.();
			detach = undefined;
		}
		return true;
	};

	const subscribe = (kind: ScreenStreamKind, id: string, listener: ScreenListener): Unsubscribe => {
		const key = keyOf(kind, id);
		const opened = join(key, listener);
		if (opened && kind === "observe") api.observe(subscriberId, id);
		let active = true;
		return () => {
			if (!active) return;
			active = false;
			if (leave(key, listener) && kind === "observe") api.unobserve(subscriberId, id);
		};
	};

	return {
		observe: (paneId, listener) => subscribe("observe", paneId, listener),
		control: (terminalId, listener) => subscribe("control", terminalId, listener),
	};
}
