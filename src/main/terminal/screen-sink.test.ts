import type { ScreenChunk, ScreenPortMessage } from "@shared/screens";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescingSink } from "./screen-sink";

const bytes = (text: string, cols = 80, rows = 24) => ({
	data: new TextEncoder().encode(text),
	cols,
	rows,
});
const text = (chunk: ScreenChunk | undefined): string => new TextDecoder().decode(chunk?.data);

function setup() {
	const posted: ScreenPortMessage[] = [];
	const sink = createCoalescingSink(7, (message) => posted.push(message), 16);
	const chunks = (): ScreenChunk[] =>
		posted.flatMap((message) => (message.type === "chunks" ? message.chunks : []));
	return { sink, posted, chunks };
}

describe("createCoalescingSink", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("batches each stream's bytes over one interval into a single chunk", () => {
		const { sink, posted, chunks } = setup();
		sink.write("observe", "w1:p1", bytes("ab"), true);
		sink.write("observe", "w1:p1", bytes("cd"), false);
		sink.write("control", "screen-1", bytes("xy"), false);
		expect(posted).toHaveLength(0);
		vi.advanceTimersByTime(16);
		expect(posted).toHaveLength(1);
		expect(chunks().map((chunk) => [chunk.kind, chunk.id, chunk.reset, text(chunk)])).toEqual([
			["observe", "w1:p1", true, "abcd"],
			["control", "screen-1", false, "xy"],
		]);
	});

	it("drops a stream's pending backlog when a reset arrives", () => {
		const { sink, chunks } = setup();
		sink.write("observe", "w1:p1", bytes("stale"), false);
		sink.write("observe", "w1:p2", bytes("other"), false);
		sink.write("observe", "w1:p1", bytes("fresh"), true);
		vi.advanceTimersByTime(16);
		expect(chunks().map((chunk) => [chunk.id, chunk.reset, text(chunk)])).toEqual([
			["w1:p2", false, "other"],
			["w1:p1", true, "fresh"],
		]);
	});

	it("starts a new chunk when the frame size changes", () => {
		const { sink, chunks } = setup();
		sink.write("control", "screen-1", bytes("a", 80, 24), false);
		sink.write("control", "screen-1", bytes("b", 100, 30), false);
		vi.advanceTimersByTime(16);
		expect(chunks().map((chunk) => [chunk.cols, chunk.rows, text(chunk)])).toEqual([
			[80, 24, "a"],
			[100, 30, "b"],
		]);
	});

	it("flushes pending bytes before a status so the status never overtakes them", () => {
		const { sink, posted } = setup();
		sink.write("control", "screen-1", bytes("bye"), false);
		sink.status({ kind: "control", id: "screen-1", state: "closed", reason: "detached" });
		expect(posted.map((message) => message.type)).toEqual(["chunks", "status"]);
	});

	it("posts each chunk in its own exact buffer, not a view on a shared pool", () => {
		const { sink, chunks } = setup();
		const pooled = Buffer.from("xxhelloxx").subarray(2, 7);
		sink.write("observe", "w1:p1", { data: pooled, cols: 80, rows: 24 }, true);
		vi.advanceTimersByTime(16);
		const [chunk] = chunks();
		expect(chunk?.data.byteLength).toBe(5);
		expect(chunk?.data.buffer.byteLength).toBe(5);
		expect(text(chunk)).toBe("hello");
	});

	it("sends nothing after dispose", () => {
		const { sink, posted } = setup();
		sink.write("observe", "w1:p1", bytes("a"), true);
		sink.dispose();
		sink.status({ kind: "observe", id: "w1:p1", state: "live" });
		vi.advanceTimersByTime(100);
		expect(posted).toHaveLength(0);
	});
});
