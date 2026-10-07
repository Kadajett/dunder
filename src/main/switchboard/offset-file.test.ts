import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readSavedOffset } from "./offset-file";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("reads a saved offset, and treats a missing, empty (an interrupted write) or corrupt file as a lost place", async () => {
	const dir = mkdtempSync(join(tmpdir(), "offset-"));
	dirs.push(dir);
	const file = (name: string, text: string) => {
		writeFileSync(join(dir, name), text);
		return join(dir, name);
	};
	expect(await readSavedOffset(file("ok.json", '{"offset":42}'))).toBe(42);
	expect(await readSavedOffset(join(dir, "missing.json"))).toBeNull();
	expect(await readSavedOffset(file("empty.json", ""))).toBeNull();
	expect(await readSavedOffset(file("corrupt.json", '{"off'))).toBeNull();
	expect(await readSavedOffset(file("wrong.json", '{"offset":-1}'))).toBeNull();
});
