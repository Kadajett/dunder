import { describe, expect, it } from "vitest";
import { setLockfileVersion, setManifestVersion } from "./manifest.mts";

describe("setManifestVersion", () => {
	it("changes only the top-level version line", () => {
		const text = [
			"{",
			'\t"name": "dunder-ai",',
			'\t"build": { "deb": { "version": "9.9.9" } },',
			'\t"version": "0.1.0",',
			'\t"files": ["dist"]',
			"}",
			"",
		].join("\n");
		expect(setManifestVersion(text, "0.2.0")).toBe(text.replace('"0.1.0"', '"0.2.0"'));
	});

	it("rejects a manifest without a top-level version", () => {
		const text = '{\n\t"name": "x",\n\t"build": {\n\t\t"version": "1.0.0"\n\t}\n}\n';
		expect(() => setManifestVersion(text, "0.2.0")).toThrow(/no top-level version/);
	});

	it("rejects a non-semver version", () => {
		expect(() => setManifestVersion('{\n\t"version": "0.1.0"\n}\n', "v0.2.0")).toThrow();
	});
});

describe("setLockfileVersion", () => {
	const lockfile = {
		name: "dunder",
		version: "0.1.0",
		lockfileVersion: 3,
		requires: true,
		packages: {
			"": { name: "dunder", version: "0.1.0", dependencies: { zod: "^4.0.0" } },
			"packages/installer": { name: "dunder-ai", version: "0.1.0" },
			"node_modules/zod": { version: "4.0.0" },
		},
	};

	it("updates root and listed entries, leaving dependencies and key order alone", () => {
		const text = `${JSON.stringify(lockfile, null, "\t")}\n`;
		const next = setLockfileVersion(text, "0.2.0", ["", "packages/installer", "packages/missing"]);
		const expected = structuredClone(lockfile);
		expected.version = "0.2.0";
		expected.packages[""].version = "0.2.0";
		expected.packages["packages/installer"].version = "0.2.0";
		expect(next).toBe(`${JSON.stringify(expected, null, "\t")}\n`);
	});

	it("keeps a two-space indent", () => {
		const text = `${JSON.stringify(lockfile, null, 2)}\n`;
		const next = setLockfileVersion(text, "0.2.0", [""]);
		expect(next).toMatch(/^\{\n {2}"name": "dunder",\n {2}"version": "0.2.0"/);
	});
});
