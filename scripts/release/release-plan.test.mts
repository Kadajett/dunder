import { describe, expect, it } from "vitest";
import { parseLsRemoteTags, planRelease } from "./release-plan.mts";

describe("parseLsRemoteTags", () => {
	it("reads tag names and folds peeled annotated tags", () => {
		const output = [
			"1111111111111111111111111111111111111111\trefs/tags/v0.1.0",
			"2222222222222222222222222222222222222222\trefs/tags/v0.1.0^{}",
			"3333333333333333333333333333333333333333\trefs/heads/main",
			"4444444444444444444444444444444444444444\trefs/tags/v0.2.0",
			"",
		].join("\n");
		expect(parseLsRemoteTags(output)).toEqual(["v0.1.0", "v0.2.0"]);
	});
});

describe("planRelease", () => {
	it("releases a version that has no tag yet", () => {
		const plan = planRelease({ version: "0.2.0", existingTags: ["v0.1.0"], force: false });
		expect(plan).toMatchObject({ version: "0.2.0", tag: "v0.2.0", release: true });
	});

	it("releases the very first version", () => {
		expect(planRelease({ version: "0.1.0", existingTags: [], force: false }).release).toBe(true);
	});

	it("skips an already tagged version unless forced", () => {
		const input = { version: "0.1.0", existingTags: ["v0.1.0"] };
		expect(planRelease({ ...input, force: false }).release).toBe(false);
		expect(planRelease({ ...input, force: true }).release).toBe(true);
	});

	it("refuses a version older than the latest release", () => {
		const input = { version: "0.1.5", existingTags: ["v0.2.0"], force: false };
		expect(() => planRelease(input)).toThrow(/older than the latest release v0.2.0/);
	});
});
