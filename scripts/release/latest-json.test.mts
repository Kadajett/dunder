import { describe, expect, it } from "vitest";
import { buildLatestJson, releaseAssetNames } from "./latest-json.mts";

const files = [
	"Dunder-1.2.3-linux-x86_64.AppImage",
	"dunder_1.2.3_amd64.deb",
	"builder-debug.yml",
	"linux-unpacked",
	"Dunder-1.2.2-linux-x86_64.AppImage",
];

describe("buildLatestJson", () => {
	it("points at the release download URLs of this version's assets", () => {
		expect(buildLatestJson({ version: "1.2.3", files, repository: "Kadajett/dunder" })).toEqual({
			version: "1.2.3",
			tag: "v1.2.3",
			assets: {
				"linux-x64": {
					appimage:
						"https://github.com/Kadajett/dunder/releases/download/v1.2.3/Dunder-1.2.3-linux-x86_64.AppImage",
					deb: "https://github.com/Kadajett/dunder/releases/download/v1.2.3/dunder_1.2.3_amd64.deb",
				},
			},
		});
	});

	it("fails when an asset of the version is missing, naming it", () => {
		const input = { version: "1.2.2", files, repository: "Kadajett/dunder" };
		expect(() => buildLatestJson(input)).toThrow("dunder_1.2.2_amd64.deb");
	});

	it("names prerelease assets with the full version", () => {
		expect(releaseAssetNames("2.0.0-rc.1")).toEqual({
			appimage: "Dunder-2.0.0-rc.1-linux-x86_64.AppImage",
			deb: "dunder_2.0.0-rc.1_amd64.deb",
		});
	});
});
