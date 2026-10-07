import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { rotatedPath } from "./mailbox";
import { appendResultLine } from "./results-file";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("rotates a results file before a line would take it past the limit, keeping the latest answers in two generations", async () => {
	const dir = mkdtempSync(join(tmpdir(), "results-"));
	dirs.push(dir);
	const path = join(dir, "state", "results.ndjson");
	const answer = (n: number) => JSON.stringify({ id: `request-${n}`, ok: true, message: "done" });
	// Answers race each other (two services share the plan results file): none may be lost to a rotation.
	await Promise.all(Array.from({ length: 6 }, (_, n) => appendResultLine(path, answer(n), 150)));
	const generation = (file: string) => readFileSync(file, "utf8").split("\n").filter(Boolean);
	const live = generation(path);
	const old = generation(rotatedPath(path));
	// Each line is 46 bytes: three fit under 150, so the six land as two full generations, in order.
	expect(old).toEqual([0, 1, 2].map(answer));
	expect(live).toEqual([3, 4, 5].map(answer));
	await appendResultLine(path, answer(6), 150);
	expect(generation(rotatedPath(path))).toEqual([3, 4, 5].map(answer));
	expect(generation(path)).toEqual([answer(6)]);
});
