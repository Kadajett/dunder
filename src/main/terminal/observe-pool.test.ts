import type { ScreenStatus } from "@shared/screens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneSize, StreamEvents, TerminalFrame } from "./herdr-stream";
import { ObservePool } from "./observe-pool";
import type { ScreenBytes, ScreenSink } from "./screen-sink";

interface FakeProcess {
	readonly paneId: string;
	readonly size: PaneSize;
	readonly events: StreamEvents;
	stopped: boolean;
}

function frame(text: string, full = false): TerminalFrame {
	return { data: new TextEncoder().encode(text), full, cols: 80, rows: 24, seq: 0 };
}

interface Written {
	readonly id: string;
	readonly text: string;
	readonly reset: boolean;
}

function fakeSink(ownerId: number) {
	const writes: Written[] = [];
	const statuses: ScreenStatus[] = [];
	const sink: ScreenSink = {
		ownerId,
		write: (_kind, id, bytes: ScreenBytes, reset) =>
			writes.push({ id, text: new TextDecoder().decode(bytes.data), reset }),
		status: (status) => statuses.push(status),
	};
	return { sink, writes, statuses };
}

function setup(replayLimitBytes = 1024) {
	const processes: FakeProcess[] = [];
	const pool = new ObservePool({
		start: (paneId, size, events) => {
			const process: FakeProcess = { paneId, size, events, stopped: false };
			processes.push(process);
			return {
				stop: () => {
					process.stopped = true;
				},
				exited: Promise.resolve(),
			};
		},
		resolveSize: async (paneId) =>
			paneId === "w1:p1" ? { cols: 60, rows: 40 } : { cols: 120, rows: 36 },
		lingerMs: 2_000,
		retryInitialMs: 500,
		retryMaxMs: 4_000,
		replayLimitBytes,
	});
	const alive = () => processes.filter((process) => !process.stopped);
	return { pool, processes, alive };
}

describe("ObservePool", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("runs one process per pane at the pane's layout size, shared by all subscribers", async () => {
		const { pool, processes } = setup();
		const a = fakeSink(1);
		const b = fakeSink(2);
		pool.subscribe(a.sink, "monitor", "w1:p1");
		pool.subscribe(a.sink, "tile", "w1:p1");
		pool.subscribe(b.sink, "monitor", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		expect(processes.map((process) => [process.paneId, process.size])).toEqual([
			["w1:p1", { cols: 60, rows: 40 }],
		]);
		processes[0]?.events.onFrame(frame("hello", true));
		expect(a.writes).toEqual([{ id: "w1:p1", text: "hello", reset: true }]);
		expect(b.writes).toEqual([{ id: "w1:p1", text: "hello", reset: true }]);
	});

	it("survives StrictMode mount/unmount/mount without spawning or killing", async () => {
		const { pool, processes, alive } = setup();
		const { sink } = fakeSink(1);
		pool.subscribe(sink, "monitor", "w1:p1");
		pool.subscribe(sink, "monitor", "w1:p1");
		pool.unsubscribe(1, "monitor", "w1:p1");
		pool.unsubscribe(1, "monitor", "w1:p1");
		pool.subscribe(sink, "monitor", "w1:p1");
		await vi.advanceTimersByTimeAsync(10_000);
		expect(processes).toHaveLength(1);
		expect(alive()).toHaveLength(1);
	});

	it("stops the process only after the last subscriber has been gone for the linger time", async () => {
		const { pool, alive } = setup();
		const { sink } = fakeSink(1);
		pool.subscribe(sink, "a", "w1:p1");
		pool.subscribe(sink, "b", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		pool.unsubscribe(1, "a", "w1:p1");
		await vi.advanceTimersByTimeAsync(5_000);
		expect(alive()).toHaveLength(1);
		pool.unsubscribe(1, "b", "w1:p1");
		await vi.advanceTimersByTimeAsync(1_999);
		expect(alive()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(alive()).toHaveLength(0);
		expect(pool.runningPanes()).toEqual([]);
	});

	it("replays the screen since the last full repaint to a late joiner instead of restarting", async () => {
		const { pool, processes } = setup();
		const first = fakeSink(1);
		pool.subscribe(first.sink, "a", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		const events = processes[0]?.events;
		events?.onFrame(frame("old", true));
		events?.onFrame(frame("FULL", true));
		events?.onFrame(frame("+delta"));
		pool.unsubscribe(1, "a", "w1:p1");
		const late = fakeSink(1);
		pool.subscribe(late.sink, "a", "w1:p1");
		expect(processes).toHaveLength(1);
		expect(late.statuses.at(-1)?.state).toBe("live");
		expect(late.writes).toEqual([
			{ id: "w1:p1", text: "FULL", reset: true },
			{ id: "w1:p1", text: "+delta", reset: false },
		]);
	});

	it("re-attaches when the replay overflowed, giving every subscriber a reset", async () => {
		const { pool, processes, alive } = setup(8);
		const first = fakeSink(1);
		pool.subscribe(first.sink, "a", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		processes[0]?.events.onFrame(frame("full", true));
		processes[0]?.events.onFrame(frame("0123456789"));
		pool.subscribe(fakeSink(1).sink, "b", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		expect(processes).toHaveLength(2);
		expect(alive()).toHaveLength(1);
		processes[1]?.events.onFrame(frame("again", true));
		expect(first.writes.at(-1)).toEqual({ id: "w1:p1", text: "again", reset: true });
	});

	it("restarts a dead stream with exponential backoff, reporting disconnected", async () => {
		const { pool, processes } = setup();
		const { sink, statuses, writes } = fakeSink(1);
		pool.subscribe(sink, "a", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		processes[0]?.events.onFrame(frame("one", true));
		processes[0]?.events.onClosed("server went away");
		expect(statuses.at(-1)).toMatchObject({ state: "disconnected", reason: "server went away" });
		await vi.advanceTimersByTimeAsync(499);
		expect(processes).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(processes).toHaveLength(2);
		processes[1]?.events.onClosed("still down");
		await vi.advanceTimersByTimeAsync(999);
		expect(processes).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(processes).toHaveLength(3);
		processes[2]?.events.onFrame(frame("back", true));
		expect(statuses.at(-1)?.state).toBe("live");
		expect(writes.at(-1)).toEqual({ id: "w1:p1", text: "back", reset: true });
	});

	it("gives up on a pane herdr reports as not found", async () => {
		const { pool, processes } = setup();
		const { sink, statuses } = fakeSink(1);
		pool.subscribe(sink, "a", "w9:p9");
		await vi.advanceTimersByTimeAsync(0);
		processes[0]?.events.onClosed("terminal target w9:p9 not found");
		await vi.advanceTimersByTimeAsync(60_000);
		expect(processes).toHaveLength(1);
		expect(statuses.at(-1)).toMatchObject({ state: "closed" });
	});

	it("ignores output from a process it has already replaced", async () => {
		const { pool, processes } = setup();
		const { sink, writes } = fakeSink(1);
		pool.subscribe(sink, "a", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		processes[0]?.events.onClosed("crash");
		await vi.advanceTimersByTimeAsync(500);
		processes[0]?.events.onFrame(frame("ghost", true));
		expect(writes).toEqual([]);
	});

	it("stops a closed window's streams immediately, keeping other windows' streams", async () => {
		const { pool, alive } = setup();
		pool.subscribe(fakeSink(1).sink, "a", "w1:p1");
		pool.subscribe(fakeSink(1).sink, "a", "w1:p2");
		pool.subscribe(fakeSink(2).sink, "a", "w1:p2");
		await vi.advanceTimersByTimeAsync(0);
		pool.dropOwner(1);
		expect(alive().map((process) => process.paneId)).toEqual(["w1:p2"]);
	});

	it("never spawns when every subscriber leaves before the size lookup returns", async () => {
		const { pool, processes } = setup();
		const { sink } = fakeSink(1);
		pool.subscribe(sink, "a", "w1:p1");
		pool.dropOwner(1);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(processes).toHaveLength(0);
	});

	it("re-attaches at the new size only when a refresh finds the pane resized", async () => {
		let size = { cols: 60, rows: 40 };
		const processes: PaneSize[] = [];
		const pool = new ObservePool({
			start: (_paneId, at) => {
				processes.push(at);
				return { stop: () => undefined, exited: Promise.resolve() };
			},
			resolveSize: async () => size,
		});
		pool.subscribe(fakeSink(1).sink, "a", "w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		pool.refresh("w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		expect(processes).toEqual([{ cols: 60, rows: 40 }]);
		size = { cols: 189, rows: 58 };
		pool.refresh("w1:p1");
		await vi.advanceTimersByTimeAsync(0);
		expect(processes).toEqual([
			{ cols: 60, rows: 40 },
			{ cols: 189, rows: 58 },
		]);
	});
});
