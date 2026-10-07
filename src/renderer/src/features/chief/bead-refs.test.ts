import { describe, expect, it } from "vitest";
import { beadPrefixes, beadSegments } from "./bead-refs";

const PREFIXES = ["office"];

describe("beadPrefixes", () => {
	it("takes each prefix once from the board's ids", () => {
		expect(beadPrefixes(["office-dkh", "office-dk7.3", "acme-x1y", "weird"])).toEqual([
			"office",
			"acme",
		]);
	});
});

describe("beadSegments", () => {
	it("splits ids out of text, sub-ids included and trailing punctuation left behind", () => {
		expect(beadSegments("office-v4d, then office-dk7.2. Done (office-ig8)", PREFIXES)).toEqual([
			{ id: "office-v4d" },
			", then ",
			{ id: "office-dk7.2" },
			". Done (",
			{ id: "office-ig8" },
			")",
		]);
	});

	it("finds an id in a merge line, but not glued into a longer word", () => {
		expect(beadSegments("Merge bead/office-dkh", PREFIXES)).toEqual([
			"Merge bead/",
			{ id: "office-dkh" },
		]);
		expect(beadSegments("pre-office-dkh office-dkh-old office-ab e-mail", PREFIXES)).toEqual([
			"pre-office-dkh office-dkh-old office-ab e-mail",
		]);
	});

	it("only knows the board's prefixes", () => {
		expect(beadSegments("acme-x1y and office-dkh", ["acme"])).toEqual([
			{ id: "acme-x1y" },
			" and office-dkh",
		]);
		expect(beadSegments("office-dkh", [])).toEqual(["office-dkh"]);
	});
});
