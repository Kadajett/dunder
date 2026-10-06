import type { MemoryProject } from "@shared/office-stats";
import { describe, expect, it } from "vitest";
import { searchMemories } from "./memory-search";

const projects: MemoryProject[] = [
	{
		state: "ok",
		cwd: "/dev/herdr-office",
		name: "herdr-office",
		memories: [
			{ key: "dev-app", text: "Main and preload changes need a restart" },
			{ key: "focus-mode", text: "Never use Esc to leave a screen" },
		],
	},
	{
		state: "ok",
		cwd: "/dev/shop",
		name: "shop",
		memories: [{ key: "deploys", text: "Restart the queue worker after deploys" }],
	},
	{ state: "unavailable", cwd: "/dev/scratch", name: "scratch", reason: "no beads database" },
];

const summary = (query: string) =>
	searchMemories(projects, query).map(
		(group) => `${group.project.name}:${group.shown.map((m) => m.key).join(",")}/${group.total}`,
	);

describe("searchMemories", () => {
	it("shows every project, unavailable ones included, without a search", () => {
		expect(summary("")).toEqual([
			"herdr-office:dev-app,focus-mode/2",
			"shop:deploys/1",
			"scratch:/0",
		]);
	});

	it("searches keys and texts across every project, case-insensitively", () => {
		expect(summary("RESTART")).toEqual(["herdr-office:dev-app/2", "shop:deploys/1"]);
		expect(summary("focus")).toEqual(["herdr-office:focus-mode/2"]);
	});

	it("drops every project when nothing matches", () => {
		expect(summary("kubernetes")).toEqual([]);
	});
});
