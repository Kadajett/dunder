import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type MailboxTail, rotatedPath, tailMailbox } from "./mailbox";

const dirs: string[] = [];
const tails: MailboxTail[] = [];
afterEach(() => {
	for (const tail of tails.splice(0)) tail.stop();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A tail on a fresh file that rotates past 200 bytes; records every line and the last offset it reported. */
async function follow(path: string, offset = 0) {
	const seen: string[] = [];
	const offsets: number[] = [];
	const tail = await tailMailbox({
		path,
		offset,
		rotateAtBytes: 200,
		pollMs: 20,
		onLines: (lines, next) => {
			seen.push(...lines);
			offsets.push(next);
		},
		onError: (error) => {
			throw error;
		},
	});
	tails.push(tail);
	return { tail, seen, offsets };
}

const line = (n: number) => `${JSON.stringify({ n, pad: "x".repeat(40) })}\n`;
const ns = (lines: readonly string[]) => lines.map((text) => JSON.parse(text).n);

function file(): string {
	const dir = mkdtempSync(join(tmpdir(), "tail-"));
	dirs.push(dir);
	return join(dir, "requests.ndjson");
}

describe("tailing a requests file with rotation", () => {
	it("rotates a fully read file past the limit, reads the old generation's late lines once, and carries on", async () => {
		const path = file();
		const { seen, offsets } = await follow(path);
		for (let n = 1; n <= 4; n++) appendFileSync(path, line(n));
		// Four 57-byte lines pass 200 bytes: the tail reads them, then starts a new generation.
		await vi.waitFor(() => expect(existsSync(rotatedPath(path))).toBe(true));
		expect(ns(seen)).toEqual([1, 2, 3, 4]);
		expect(offsets.at(-1)).toBe(0);
		// A CLI that opened the file just before the rename appends to the old generation.
		appendFileSync(rotatedPath(path), line(5));
		appendFileSync(path, line(6));
		await vi.waitFor(() => expect(ns(seen)).toEqual([1, 2, 3, 4, 5, 6]));
		// Nothing is read twice, and the reported offset is the new file's.
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(ns(seen)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(offsets.at(-1)).toBe(line(6).length);
		expect(readFileSync(path, "utf8")).toBe(line(6));
	});

	it("resumes after a restart past a rotation without replaying or skipping", async () => {
		const path = file();
		const first = await follow(path);
		for (let n = 1; n <= 4; n++) appendFileSync(path, line(n));
		await vi.waitFor(() => expect(existsSync(rotatedPath(path))).toBe(true));
		appendFileSync(path, line(5));
		await vi.waitFor(() => expect(ns(first.seen)).toEqual([1, 2, 3, 4, 5]));
		first.tail.stop();
		const saved = first.offsets.at(-1) ?? -1;
		appendFileSync(path, line(6));
		const second = await follow(path, saved);
		await vi.waitFor(() => expect(ns(second.seen)).toEqual([6]));
	});

	it("leaves a file under the limit, and a partial line, where they are", async () => {
		const path = file();
		const { seen } = await follow(path);
		appendFileSync(path, line(1));
		appendFileSync(path, line(2) + line(3) + line(4).slice(0, 40));
		await vi.waitFor(() => expect(ns(seen)).toEqual([1, 2, 3]));
		await new Promise((resolve) => setTimeout(resolve, 100));
		// Over 200 bytes, but a CLI is mid-line: no rotation until the line is whole.
		expect(existsSync(rotatedPath(path))).toBe(false);
		appendFileSync(path, line(4).slice(40));
		await vi.waitFor(() => expect(existsSync(rotatedPath(path))).toBe(true));
		expect(ns(seen)).toEqual([1, 2, 3, 4]);
	});
});
