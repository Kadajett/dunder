import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompactionWatch, isCompactionLine } from "./compaction-watch";

const compaction = `${JSON.stringify({ type: "compaction", id: "c1", summary: "## Goal" })}\n`;
const message = `${JSON.stringify({ type: "message", text: "talking about compaction" })}\n`;

describe("compaction watch", () => {
	let dir = "";
	let seen: string[] = [];
	let watch: CompactionWatch;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "compaction-watch-"));
		seen = [];
		watch = new CompactionWatch((agent) => seen.push(agent));
	});
	afterEach(async () => {
		watch.stop();
		await rm(dir, { recursive: true, force: true });
	});

	it("recognises only compaction entries", () => {
		expect(isCompactionLine(compaction.trim())).toBe(true);
		expect(isCompactionLine(message.trim())).toBe(false);
		expect(isCompactionLine('{"type":"compaction"')).toBe(false);
	});

	it("reports compactions appended after tracking, not earlier ones", async () => {
		const log = join(dir, "nora.jsonl");
		await writeFile(log, compaction + message);
		watch.track(new Map([["nora", log]]));
		await watch.poll();
		expect(seen).toEqual([]);
		await appendFile(log, message + compaction);
		await watch.poll();
		expect(seen).toEqual(["nora"]);
	});

	it("waits for a line to be complete before judging it", async () => {
		const log = join(dir, "ben.jsonl");
		await writeFile(log, "");
		watch.track(new Map([["ben", log]]));
		await watch.poll();
		await appendFile(log, compaction.slice(0, 20));
		await watch.poll();
		expect(seen).toEqual([]);
		await appendFile(log, compaction.slice(20));
		await watch.poll();
		expect(seen).toEqual(["ben"]);
	});

	it("reads a session log that only appears after tracking from its start", async () => {
		const log = join(dir, "ava.jsonl");
		watch.track(new Map([["ava", log]]));
		await watch.poll();
		await writeFile(log, message + compaction);
		await watch.poll();
		expect(seen).toEqual(["ava"]);
	});

	it("follows an agent to its new session log", async () => {
		const first = join(dir, "first.jsonl");
		const second = join(dir, "second.jsonl");
		await writeFile(first, "");
		await writeFile(second, compaction);
		watch.track(new Map([["jonas", first]]));
		await watch.poll();
		watch.track(new Map([["jonas", second]]));
		await watch.poll();
		await appendFile(first, compaction);
		await appendFile(second, compaction);
		await watch.poll();
		expect(seen).toEqual(["jonas"]);
	});
});
