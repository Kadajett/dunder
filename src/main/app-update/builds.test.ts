import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { keptBuild, promote, restoreKept, STAGING_DIR } from "./builds";

const GOOD = "c".repeat(40);
const roots: string[] = [];

/** A checkout with `out/` holding `live` and a staged build holding `staged` (each a marker file). */
function checkout(live: string | null, staged: string | null): string {
	const root = mkdtempSync(join(tmpdir(), "builds-"));
	roots.push(root);
	for (const [dir, marker] of [
		["out", live],
		[STAGING_DIR, staged],
	] as const) {
		if (marker === null) continue;
		mkdirSync(join(root, dir));
		writeFileSync(join(root, dir, "build.txt"), marker);
	}
	return root;
}
const marker = (root: string, dir: string) => readFileSync(join(root, dir, "build.txt"), "utf8");

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kept builds", () => {
	it("keeps the replaced build one level deep, named by its commit", async () => {
		const root = checkout("good", "bad");
		await promote(root, GOOD);
		expect(marker(root, "out")).toBe("bad");
		expect(await keptBuild(root)).toMatchObject({ commit: GOOD });
		// The next update replaces the kept one.
		mkdirSync(join(root, STAGING_DIR));
		writeFileSync(join(root, STAGING_DIR, "build.txt"), "fixed");
		await promote(root, "d".repeat(40));
		expect(marker(root, "out-prev")).toBe("bad");
		expect((await keptBuild(root))?.commit).toBe("d".repeat(40));
	});

	it("keeps nothing it can't name, or when there was no build before", async () => {
		const unnamed = checkout("good", "bad");
		await promote(unnamed, undefined);
		expect(existsSync(join(unnamed, "out-prev"))).toBe(false);
		const first = checkout(null, "bad");
		await promote(first, GOOD);
		expect(marker(first, "out")).toBe("bad");
		expect(await keptBuild(first)).toBeNull();
	});

	it("rolls back: the kept build runs again, the bad one is gone and nothing is kept", async () => {
		const root = checkout("good", "bad");
		await promote(root, GOOD);
		await restoreKept(root);
		expect(marker(root, "out")).toBe("good");
		expect(existsSync(join(root, "out", "kept-build.json"))).toBe(false);
		expect(existsSync(join(root, "out-bad"))).toBe(false);
		expect(await keptBuild(root)).toBeNull();
	});

	it("leaves the running build in place when there is nothing to roll back to", async () => {
		const root = checkout("bad", null);
		await expect(restoreKept(root)).rejects.toThrow();
		expect(marker(root, "out")).toBe("bad");
	});
});
