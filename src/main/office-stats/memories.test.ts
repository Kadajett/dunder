import { describe, expect, it } from "vitest";
import { parseMemories } from "./memories";

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
