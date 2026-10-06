import type { ScreenChunk, ScreenState, ScreenStatus } from "@shared/screens";
import type { Paintable, PaintScheduler } from "./scheduler";
import type { ScreenClient, ScreenListener } from "./screen-client";

/** The paint target behind one pane's texture. */
export interface ScreenSurface<TTexture> {
	readonly texture: TTexture;
	/** Paints the current screen with the overlay for `state`. */
	paint(state: ScreenState): void;
	/** Feeds observe output into the screen. */
	apply(chunk: ScreenChunk): void;
	dispose(): void;
}

/** One consumer's view of a pane's shared screen. */
export interface ScreenHandle<TTexture> {
	readonly texture: TTexture;
	getState(): ScreenState;
	/** Notifies on state changes; returns an unsubscribe. */
	subscribe(listener: () => void): () => void;
	/** Updates whether this consumer shows the texture and how to request a render frame. */
	update(visible: boolean, invalidate: (() => void) | undefined): void;
	/** Idempotent. */
	release(): void;
}

export interface ScreenStore<TTexture> {
	acquire(paneId: string): ScreenHandle<TTexture>;
}

export interface ScreenStoreDeps<TTexture> {
	readonly client: ScreenClient;
	readonly scheduler: PaintScheduler;
	/** `onDirty` must be called whenever the surface has unpainted screen changes. */
	createSurface(onDirty: () => void): ScreenSurface<TTexture>;
	/** Keep an unused pane's screen this long, so remounts (StrictMode, layout edits) reuse it. */
	readonly lingerMs?: number;
}

interface Consumer {
	visible: boolean;
	invalidate: (() => void) | undefined;
}

const DEFAULT_LINGER_MS = 1000;

/** Shared state for one observed pane: its surface, observe subscription and consumers. */
class PaneScreen<TTexture> implements Paintable, ScreenListener {
	readonly consumers = new Set<Consumer>();
	readonly listeners = new Set<() => void>();
	readonly surface: ScreenSurface<TTexture>;
	dirty = true;
	state: ScreenState = "connecting";
	#lingerTimer: number | undefined;
	readonly #scheduler: PaintScheduler;
	readonly #unsubscribe: () => void;

	constructor(paneId: string, deps: ScreenStoreDeps<TTexture>) {
		this.#scheduler = deps.scheduler;
		this.surface = deps.createSurface(() => this.markDirty());
		this.#unsubscribe = deps.client.observe(paneId, this);
	}

	get visible(): boolean {
		for (const consumer of this.consumers) if (consumer.visible) return true;
		return false;
	}

	markDirty(): void {
		this.dirty = true;
		this.#scheduler.request(this);
	}

	/** Runs `expire` after `ms` unless a consumer arrives first (see `keep`). */
	linger(ms: number, expire: () => void): void {
		clearTimeout(this.#lingerTimer);
		this.#lingerTimer = setTimeout(() => {
			if (this.consumers.size === 0) expire();
		}, ms);
	}

	keep(): void {
		clearTimeout(this.#lingerTimer);
	}

	paint(): void {
		this.dirty = false;
		this.surface.paint(this.state);
		for (const { invalidate } of this.consumers) invalidate?.();
	}

	chunk(chunk: ScreenChunk): void {
		this.surface.apply(chunk);
	}

	status(status: ScreenStatus): void {
		if (status.state === this.state) return;
		this.state = status.state;
		this.markDirty();
		for (const listener of this.listeners) listener();
	}

	dispose(): void {
		this.#unsubscribe();
		this.#scheduler.remove(this);
		this.surface.dispose();
	}
}

function createHandle<T>(screen: PaneScreen<T>, release: () => void): ScreenHandle<T> {
	const consumer: Consumer = { visible: false, invalidate: undefined };
	screen.consumers.add(consumer);
	let released = false;
	return {
		texture: screen.surface.texture,
		getState: () => screen.state,
		subscribe(listener) {
			screen.listeners.add(listener);
			return () => screen.listeners.delete(listener);
		},
		update(visible, invalidate) {
			const revealed = visible && !consumer.visible;
			consumer.visible = visible;
			consumer.invalidate = invalidate;
			if (revealed && screen.dirty) screen.markDirty();
		},
		release() {
			if (released) return;
			released = true;
			screen.consumers.delete(consumer);
			release();
		},
	};
}

/** Per-pane screens shared by all consumers; a pane's screen lingers briefly after its last release. */
export function createScreenStore<T>(deps: ScreenStoreDeps<T>): ScreenStore<T> {
	const screens = new Map<string, PaneScreen<T>>();
	const lingerMs = deps.lingerMs ?? DEFAULT_LINGER_MS;

	const releaseFrom = (paneId: string, screen: PaneScreen<T>): void => {
		if (screen.consumers.size > 0) return;
		screen.linger(lingerMs, () => {
			screens.delete(paneId);
			screen.dispose();
		});
	};

	return {
		acquire(paneId) {
			const screen = screens.get(paneId) ?? new PaneScreen(paneId, deps);
			screens.set(paneId, screen);
			screen.keep();
			return createHandle(screen, () => releaseFrom(paneId, screen));
		},
	};
}
