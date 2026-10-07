import {
	beadOfSubject,
	COMMIT_MARK,
	displayTitle,
	isInternalOnly,
	pathsByBead,
} from "@shared/change-notes.mts";
import { describe, expect, it } from "vitest";

describe("change notes", () => {
	it("names the bead of an engineer's commit or Max's merge line, nothing else", () => {
		expect(beadOfSubject("office-dk7.2: summary")).toEqual({ id: "office-dk7.2", merge: false });
		expect(beadOfSubject("Merge bead/office-7ji (rework)")).toEqual({
			id: "office-7ji",
			merge: true,
		});
		expect(beadOfSubject("Bump vite")).toBeNull();
	});

	it("drops 'idea:', 'epic:' and 'HUD audit #N:' from titles", () => {
		expect(displayTitle("idea: Evening wrap-up")).toBe("Evening wrap-up");
		expect(displayTitle("HUD audit #6: Team cards carry 5 actions")).toBe(
			"Team cards carry 5 actions",
		);
		expect(displayTitle("Ideas board")).toBe("Ideas board");
	});

	it("calls a bead internal only when every file is tooling, agent docs, tests, CI or Beads", () => {
		expect(
			isInternalOnly([
				"scripts/scene-shot/hud-shot.mts",
				"docs/agents/chief-of-staff.md",
				"src/main/x.test.ts",
				".github/workflows/ci.yml",
				".beads/config.yaml",
			]),
		).toBe(true);
		expect(isInternalOnly(["scripts/a.mts", "src/renderer/App.tsx"])).toBe(false);
		expect(isInternalOnly(["docs/release-notes/next.md"])).toBe(false);
		expect(isInternalOnly([])).toBe(false);
	});

	it("collects each bead's files from git log --name-only, across its commits", () => {
		const log = [
			`${COMMIT_MARK}Merge bead/office-a\n`,
			`${COMMIT_MARK}office-a: second\n\nsrc/x.ts\nscripts/y.mts\n`,
			`${COMMIT_MARK}office-a: first\n\nsrc/x.ts\n`,
			`${COMMIT_MARK}Bump vite\n\npackage.json\n`,
		].join("");
		expect([...pathsByBead(log)]).toEqual([["office-a", ["src/x.ts", "scripts/y.mts"]]]);
	});
});
