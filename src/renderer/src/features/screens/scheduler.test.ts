import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaintScheduler, type Paintable } from "./scheduler";

class FakeItem implements Paintable {
	dirty = true;
	visible = true;
	readonly paints: number[] = [];

	paint(): void {
		this.dirty = false;
		this.paints.push(Date.now());
	}
}

describe("createPaintScheduler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(10_000);
	});
	afterEach(() => vi.useRealTimers());

	it("paints a dirty visible item on the next tick, once per batch of requests", () => {
		const scheduler = createPaintScheduler({ intervalMs: 250 });
		const item = new FakeItem();
		scheduler.request(item);
		scheduler.request(item);
		expect(item.paints).toEqual([]);
		vi.advanceTimersByTime(0);
		expect(item.paints).toEqual([10_000]);
	});

	it("throttles each item to one paint per interval", () => {
		const scheduler = createPaintScheduler({ intervalMs: 250 });
		const item = new FakeItem();
		scheduler.request(item);
		vi.advanceTimersByTime(0);
		// Changes every 50 ms for 450 ms: paints stay 250 ms apart and the last change lands.
		for (let t = 0; t < 9; t++) {
			vi.advanceTimersByTime(50);
			item.dirty = true;
			scheduler.request(item);
		}
		vi.advanceTimersByTime(1000);
		expect(item.paints).toEqual([10_000, 10_250, 10_500]);
	});

	it("throttles items independently", () => {
		const scheduler = createPaintScheduler({ intervalMs: 250 });
		const a = new FakeItem();
		const b = new FakeItem();
		scheduler.request(a);
		vi.advanceTimersByTime(100);
		a.dirty = true;
		scheduler.request(a);
		scheduler.request(b);
		vi.advanceTimersByTime(0);
		expect(b.paints).toEqual([10_100]);
		expect(a.paints).toEqual([10_000]);
		vi.advanceTimersByTime(150);
		expect(a.paints).toEqual([10_000, 10_250]);
	});

	it("skips invisible items until they are requested again while visible", () => {
		const scheduler = createPaintScheduler({ intervalMs: 250 });
		const item = new FakeItem();
		item.visible = false;
		scheduler.request(item);
		vi.advanceTimersByTime(1000);
		expect(item.paints).toEqual([]);
		item.visible = true;
		scheduler.request(item);
		vi.advanceTimersByTime(0);
		expect(item.paints).toEqual([11_000]);
	});

	it("drops a pending item that turns invisible before its turn", () => {
		const scheduler = createPaintScheduler({ intervalMs: 250 });
		const item = new FakeItem();
		scheduler.request(item);
		vi.advanceTimersByTime(0);
		item.dirty = true;
		scheduler.request(item);
		item.visible = false;
		vi.advanceTimersByTime(1000);
		expect(item.paints).toEqual([10_000]);
	});

	it("never paints a removed item", () => {
		const scheduler = createPaintScheduler({ intervalMs: 250 });
		const item = new FakeItem();
		scheduler.request(item);
		scheduler.remove(item);
		vi.advanceTimersByTime(1000);
		expect(item.paints).toEqual([]);
	});
});
