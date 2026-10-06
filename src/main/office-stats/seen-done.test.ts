import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSeenDoneStore } from "./seen-done";

let dir = "";
let path = "";
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "seen-done-"));
	path = join(dir, "nested", "inbox-seen.json");
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("seen done store", () => {
	it("keeps marks across a restart, one entry per agent, the latest winning", async () => {
		const store = createSeenDoneStore(path);
		// Not awaited one by one: marks still land in call order.
		await Promise.all([store.mark("nora", 4), store.mark("ben", null), store.mark("nora", 6)]);
		expect(await store.all()).toEqual({ nora: 6, ben: null });
		expect(await createSeenDoneStore(path).all()).toEqual({ nora: 6, ben: null });
	});

	it("starts empty from a missing or unreadable file", async () => {
		expect(await createSeenDoneStore(path).all()).toEqual({});
		const broken = join(dir, "broken.json");
		await writeFile(broken, '{"version":1,"seen":{"nora":"four"}}');
		const store = createSeenDoneStore(broken);
		expect(await store.all()).toEqual({});
		await store.mark("ava", 2);
		expect(JSON.parse(await readFile(broken, "utf8"))).toEqual({ version: 1, seen: { ava: 2 } });
	});

	it("keeps the saved marks when a write fails", async () => {
		const store = createSeenDoneStore(path);
		await store.mark("nora", 4);
		// A directory in the way of the temp file: the next write fails.
		await mkdir(`${path}.${process.pid}.tmp`);
		await expect(store.mark("ben", 1)).rejects.toThrow();
		expect(await store.all()).toEqual({ nora: 4 });
		expect(await createSeenDoneStore(path).all()).toEqual({ nora: 4 });
	});
});
