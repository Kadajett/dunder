import type { ScreenChunk, ScreenState } from "@shared/screens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeScreensApi, textChunk } from "./fixtures/fake-screens-api";
import { createPaintScheduler } from "./scheduler";
import { createScreenClient } from "./screen-client";
import { createScreenStore, type ScreenSurface } from "./screen-store";

class FakeSurface implements ScreenSurface<string> {
	readonly painted: ScreenState[] = [];
	disposed = false;
	readonly texture: string;
	readonly #onDirty: () => void;

	constructor(texture: string, onDirty: () => void) {
		this.texture = texture;
		this.#onDirty = onDirty;
	}
	paint(state: ScreenState): void {
		this.painted.push(state);
	}
	/** Pretends the emulator parsed the chunk immediately. */
	apply(_chunk: ScreenChunk): void {
		this.#onDirty();
	}
	dispose(): void {
		this.disposed = true;
	}
}

function setup() {
	const api = new FakeScreensApi();
	const surfaces: FakeSurface[] = [];
	const store = createScreenStore<string>({
		client: createScreenClient(api, "win"),
		scheduler: createPaintScheduler({ intervalMs: 250 }),
		createSurface(onDirty) {
			const surface = new FakeSurface(`texture-${surfaces.length}`, onDirty);
			surfaces.push(surface);
			return surface;
		},
		lingerMs: 1000,
	});
	const live = (id: string) =>
		api.emit({ type: "status", status: { kind: "observe", id, state: "live" } });
	const output = (id: string) =>
		api.emit({ type: "chunks", chunks: [textChunk("observe", id, "x")] });
	return { api, store, surfaces, live, output };
}

describe("createScreenStore", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("shares one screen and texture between consumers of a pane", () => {
		const { api, store, surfaces } = setup();
		const a = store.acquire("p1");
		const b = store.acquire("p1");
		expect(a.texture).toBe(b.texture);
		expect(surfaces).toHaveLength(1);
		expect(api.calls).toEqual(["observe win p1"]);
	});

	it("paints only while some consumer is visible, then invalidates its frame", () => {
		const { store, surfaces, output } = setup();
		const handle = store.acquire("p1");
		const invalidate = vi.fn();
		handle.update(false, invalidate);
		output("p1");
		vi.advanceTimersByTime(1000);
		expect(surfaces[0]?.painted).toEqual([]);
		handle.update(true, invalidate);
		vi.advanceTimersByTime(0);
		expect(surfaces[0]?.painted).toEqual(["connecting"]);
		expect(invalidate).toHaveBeenCalledTimes(1);
	});

	it("reports status changes and repaints the overlay state", () => {
		const { store, surfaces, live } = setup();
		const handle = store.acquire("p1");
		const onChange = vi.fn();
		handle.subscribe(onChange);
		handle.update(true, undefined);
		live("p1");
		vi.advanceTimersByTime(0);
		expect(handle.getState()).toBe("live");
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(surfaces[0]?.painted).toEqual(["live"]);
	});

	it("keeps a released pane through a quick remount (StrictMode)", () => {
		const { api, store, surfaces } = setup();
		const first = store.acquire("p1");
		first.release();
		first.release();
		const second = store.acquire("p1");
		vi.advanceTimersByTime(5000);
		expect(second.texture).toBe(first.texture);
		expect(surfaces[0]?.disposed).toBe(false);
		expect(api.calls).toEqual(["observe win p1"]);
	});

	it("disposes the screen and leaves the stream after the linger", () => {
		const { api, store, surfaces } = setup();
		store.acquire("p1").release();
		vi.advanceTimersByTime(999);
		expect(surfaces[0]?.disposed).toBe(false);
		vi.advanceTimersByTime(1);
		expect(surfaces[0]?.disposed).toBe(true);
		expect(api.calls).toEqual(["observe win p1", "unobserve win p1"]);
		const again = store.acquire("p1");
		expect(again.texture).toBe("texture-1");
	});
});
