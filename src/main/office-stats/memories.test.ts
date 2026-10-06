import { avatarStyleFor } from "@shared/avatar/style";
import type { Roster, RosterAgent } from "@shared/company/roster";
import { describe, expect, it } from "vitest";
import { memoryProjects, parseMemories, rememberPlan } from "./memories";
import { forgetRequestSchema, parseProjectRequest, rememberRequestSchema } from "./memory-requests";

describe("parseMemories", () => {
	it("returns string entries as memories sorted by key, skipping bookkeeping", () => {
		const stdout = JSON.stringify({
			schema_version: 1,
			"quest-web-architecture": "SSR via server/app.ts",
			"engineering-vitest": "vitest 4.1 crashes npm 10",
		});
		expect(parseMemories(stdout)).toEqual([
			{ key: "engineering-vitest", text: "vitest 4.1 crashes npm 10" },
			{ key: "quest-web-architecture", text: "SSR via server/app.ts" },
		]);
	});

	it("treats bd's empty output as no memories", () => {
		expect(parseMemories('{\n  "schema_version": 1\n}\n')).toEqual([]);
	});

	it("rejects output that is not a JSON object", () => {
		expect(() => parseMemories('["a"]')).toThrow();
		expect(() => parseMemories("Error: no beads database")).toThrow();
	});
});

function roster(...agents: [string, string, boolean][]): Roster {
	return {
		version: 1,
		agents: agents.map(
			([name, cwd, fired]): RosterAgent => ({
				id: name,
				name,
				style: avatarStyleFor(name),
				role: "",
				harness: "omp",
				workspaceLabel: "sales",
				cwd,
				createdAt: "2026-10-06T00:00:00.000Z",
				...(fired && { firedAt: "2026-10-06T01:00:00.000Z" }),
			}),
		),
	};
}

describe("memoryProjects", () => {
	it("lists each working worker's project once, then the app root", () => {
		const team = roster(
			["nora", "/dev/shop", false],
			["jonas", "/dev/api", false],
			["ava", "/dev/shop", false],
			["ben", "/dev/old", true],
		);
		expect(memoryProjects(team, "/dev/office")).toEqual(["/dev/shop", "/dev/api", "/dev/office"]);
	});

	it("does not repeat the app root when workers already use it", () => {
		const team = roster(["nora", "/dev/office", false]);
		expect(memoryProjects(team, "/dev/office")).toEqual(["/dev/office"]);
		expect(memoryProjects(undefined, "/dev/office")).toEqual(["/dev/office"]);
	});
});

describe("rememberPlan", () => {
	it("passes the key and ends flags before the text", () => {
		expect(rememberPlan("-race finds the flake", "race-flag")).toEqual({
			ok: true,
			args: ["remember", "--key", "race-flag", "--", "-race finds the flake"],
		});
		expect(rememberPlan("auth uses JWT", undefined)).toEqual({
			ok: true,
			args: ["remember", "--", "auth uses JWT"],
		});
	});

	it("refuses a keyless single word, which bd would read as a recall", () => {
		expect(rememberPlan("dolt-phantoms", undefined).ok).toBe(false);
		expect(rememberPlan("dolt-phantoms", "phantoms").ok).toBe(true);
	});
});

describe("parseProjectRequest", () => {
	const projects = ["/dev/shop", "/dev/office"];

	it("accepts a trimmed memory for a known project", () => {
		const parsed = parseProjectRequest(
			rememberRequestSchema,
			{ cwd: "/dev/shop", text: "  ship on Fridays only after QA  ", key: "fridays" },
			projects,
		);
		expect(parsed).toEqual({
			ok: true,
			request: { cwd: "/dev/shop", text: "ship on Fridays only after QA", key: "fridays" },
		});
	});

	it("never runs bd outside the office's projects", () => {
		const parsed = parseProjectRequest(
			forgetRequestSchema,
			{ cwd: "/etc", key: "anything" },
			projects,
		);
		expect(parsed.ok).toBe(false);
	});

	it("rejects empty, oversized and badly keyed memories", () => {
		for (const payload of [
			{ cwd: "/dev/shop", text: "   " },
			{ cwd: "/dev/shop", text: "x ".repeat(1_500) },
			{ cwd: "/dev/shop", text: "a real sentence", key: "--force" },
			{ cwd: "/dev/shop" },
		]) {
			expect(parseProjectRequest(rememberRequestSchema, payload, projects).ok).toBe(false);
		}
	});
});
