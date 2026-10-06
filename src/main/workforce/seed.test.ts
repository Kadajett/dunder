import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMPTY_ROSTER, hireAgent } from "@shared/company/roster-ops";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileSeedSource, seedFileSchema, seedHires, seedRoster } from "./seed";

const NOW = new Date("2026-10-06T12:00:00.000Z");

const SEED = {
	version: 1,
	agents: [
		{
			archetype: "backend",
			name: "dwight",
			role: "backend",
			harness: "omp",
			workspaceLabel: "delivery",
			cwd: "/home/me",
			skills: ["tdd"],
		},
		{
			archetype: "reviewer",
			name: "angela",
			role: "reviewer",
			harness: "claude",
			model: "opus",
			workspaceLabel: "delivery",
		},
	],
};

let dir = "";
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "seed-"));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("seedHires", () => {
	it("keeps each worker's harness and model, and fills a missing cwd", () => {
		expect(seedHires(seedFileSchema.parse(SEED), "/fallback")).toEqual([
			{
				name: "dwight",
				role: "backend",
				harness: "omp",
				workspaceLabel: "delivery",
				cwd: "/home/me",
			},
			{
				name: "angela",
				role: "reviewer",
				harness: "claude",
				model: "opus",
				workspaceLabel: "delivery",
				cwd: "/fallback",
			},
		]);
	});

	it("rejects unsafe names, unknown harnesses and relative cwds", () => {
		const agent = SEED.agents[0];
		for (const bad of [{ name: "rm -rf" }, { harness: "vim" }, { cwd: "work" }]) {
			expect(seedFileSchema.safeParse({ version: 1, agents: [{ ...agent, ...bad }] }).success).toBe(
				false,
			);
		}
	});
});

describe("seedRoster", () => {
	it("hires every seeded worker but never a name the roster already has", () => {
		const roster = hireAgent(
			EMPTY_ROSTER,
			{ name: "angela", role: "x", workspaceLabel: "hq", cwd: "/a" },
			NOW,
			"old",
		);
		let id = 0;
		const hires = seedHires(seedFileSchema.parse(SEED), "/fallback");
		const next = seedRoster(roster, hires, NOW, () => `id-${++id}`);
		expect(next.agents.map((a) => [a.name, a.role, a.id])).toEqual([
			["angela", "x", "old"],
			["dwight", "backend", "id-1"],
		]);
	});
});

describe("fileSeedSource", () => {
	it("loads seed.json and renames it once applied", async () => {
		await writeFile(join(dir, "seed.json"), JSON.stringify(SEED));
		const source = fileSeedSource(dir, "/fallback");
		expect((await source.load()).map((hire) => hire.name)).toEqual(["dwight", "angela"]);
		await source.applied();
		expect(await readdir(dir)).toEqual(["seed.applied.json"]);
		expect(await source.load()).toEqual([]);
	});

	it("moves an invalid seed aside instead of hiring from it", async () => {
		await writeFile(join(dir, "seed.json"), JSON.stringify({ version: 2, agents: [] }));
		expect(await fileSeedSource(dir, "/fallback").load()).toEqual([]);
		expect(await readdir(dir)).toEqual(["seed.invalid.json"]);
	});
});
