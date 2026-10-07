import { describe, expect, it } from "vitest";
import { mergeText } from "./MergeNote";

describe("mergeText", () => {
	it("says clean, names up to two conflicting files then counts the rest, or names the missing branch", () => {
		expect(mergeText({ state: "clean" }, "office-1")).toBe("merges cleanly");
		expect(mergeText({ state: "conflicts", files: ["src/shared/ipc.ts"] }, "office-1")).toBe(
			"conflicts: ipc.ts",
		);
		expect(
			mergeText({ state: "conflicts", files: ["a/x.ts", "b/y.css", "z.md", "w.ts"] }, "office-1"),
		).toBe("conflicts: x.ts, y.css +2 more");
		expect(mergeText({ state: "no-branch" }, "office-1")).toBe("no branch bead/office-1");
	});
});
