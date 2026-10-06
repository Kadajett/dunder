import { describe, expect, it } from "vitest";
import { bumpVersion, compareVersions, latestTaggedVersion, parseVersion } from "./version.mts";

describe("parseVersion", () => {
	it("rejects tags, ranges and leading zeros", () => {
		for (const text of ["v1.2.3", "^1.2.3", "1.2", "01.2.3", "1.2.3-", "1.2.3+build"]) {
			expect(() => parseVersion(text)).toThrow();
		}
	});

	it("splits prerelease identifiers", () => {
		expect(parseVersion("1.2.3-rc.1")).toEqual({
			major: 1,
			minor: 2,
			patch: 3,
			prerelease: ["rc", "1"],
		});
	});
});

describe("compareVersions", () => {
	it("orders numerically, not lexically", () => {
		expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
		expect(compareVersions("1.0.0", "1.0.10")).toBe(-1);
		expect(compareVersions("2.3.4", "2.3.4")).toBe(0);
	});

	it("ranks prereleases below their release and by semver identifier rules", () => {
		const ascending = [
			"1.0.0-alpha",
			"1.0.0-alpha.1",
			"1.0.0-alpha.beta",
			"1.0.0-beta",
			"1.0.0-beta.2",
			"1.0.0-beta.11",
			"1.0.0-rc.1",
			"1.0.0",
		];
		const shuffled = [...ascending].reverse();
		expect(shuffled.sort(compareVersions)).toEqual(ascending);
	});
});

describe("bumpVersion", () => {
	it("bumps and resets lower parts", () => {
		expect(bumpVersion("0.1.9", "patch")).toBe("0.1.10");
		expect(bumpVersion("0.1.9", "minor")).toBe("0.2.0");
		expect(bumpVersion("0.9.9", "major")).toBe("1.0.0");
	});

	it("promotes a prerelease to its release like npm version", () => {
		expect(bumpVersion("1.2.3-rc.1", "patch")).toBe("1.2.3");
		expect(bumpVersion("1.3.0-rc.1", "minor")).toBe("1.3.0");
		expect(bumpVersion("1.2.3-rc.1", "minor")).toBe("1.3.0");
		expect(bumpVersion("2.0.0-rc.1", "major")).toBe("2.0.0");
		expect(bumpVersion("2.1.0-rc.1", "major")).toBe("3.0.0");
	});
});

describe("latestTaggedVersion", () => {
	it("picks the highest v-tag and ignores unrelated tags", () => {
		const tags = ["v0.9.0", "nightly", "v0.10.0-rc.1", "v0.10.0", "0.99.0"];
		expect(latestTaggedVersion(tags)).toBe("0.10.0");
	});

	it("is undefined without release tags", () => {
		expect(latestTaggedVersion(["nightly"])).toBeUndefined();
	});
});
