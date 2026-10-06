import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMPTY_ROSTER, hireAgent } from "@shared/company/roster-ops";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRoster, saveRoster } from "./roster-store";

let dir = "";
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "roster-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const roster = hireAgent(
	EMPTY_ROSTER,
	{ name: "nora", role: "lead", workspaceLabel: "sales", cwd: "/w", lastSessionPath: "/s.jsonl" },
	new Date("2026-10-06T12:00:00.000Z"),
	"id-1",
);

describe("roster store", () => {
	it("reports a first run when no file exists", async () => {
		expect(await loadRoster(join(dir, "roster.json"))).toEqual({
			roster: EMPTY_ROSTER,
			existed: false,
		});
	});

	it("round-trips a saved roster, creating the directory", async () => {
		const path = join(dir, "nested", "roster.json");
		await saveRoster(path, roster);
		expect(await loadRoster(path)).toEqual({ roster, existed: true });
		expect(await readdir(join(dir, "nested"))).toEqual(["roster.json"]);
	});

	it("moves an invalid file aside instead of overwriting it", async () => {
		const path = join(dir, "roster.json");
		await writeFile(path, '{"version":99}');
		const loaded = await loadRoster(path, new Date("2026-10-06T12:00:00.000Z"));
		expect(loaded).toEqual({ roster: EMPTY_ROSTER, existed: false });
		const aside = join(dir, "roster.json.invalid-2026-10-06T12-00-00.000Z");
		expect(await readFile(aside, "utf8")).toBe('{"version":99}');
	});
});
