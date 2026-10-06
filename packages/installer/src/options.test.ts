import { describe, expect, it } from "vitest";
import { parseArchetypePicks } from "./archetypes.js";
import { parseOptions } from "./options.js";

describe("parseOptions", () => {
	it("defaults to an interactive setup that decides nothing up front", () => {
		expect(parseOptions([])).toEqual({
			ok: true,
			options: { command: "setup", yes: false, dryRun: false },
		});
	});

	it("reads the unattended flags", () => {
		const parsed = parseOptions([
			"setup",
			"-y",
			"--dry-run",
			"--no-engineering",
			"--archetypes",
			"ops,2",
		]);
		expect(parsed).toEqual({
			ok: true,
			options: {
				command: "setup",
				yes: true,
				dryRun: true,
				engineering: false,
				archetypes: ["ops", "frontend"],
			},
		});
		expect(parseOptions(["--with-engineering"])).toMatchObject({ options: { engineering: true } });
		expect(parseOptions(["--archetypes="])).toMatchObject({ options: { archetypes: [] } });
	});

	it("rejects contradictions, unknown commands, flags and archetypes", () => {
		for (const argv of [
			["--with-engineering", "--no-engineering"],
			["install"],
			["setup", "extra"],
			["--frobnicate"],
			["--archetypes", "intern"],
		]) {
			expect(parseOptions(argv).ok).toBe(false);
		}
	});

	it("lets --help and --version win over the command", () => {
		expect(parseOptions(["setup", "--help"])).toMatchObject({ options: { command: "help" } });
		expect(parseOptions(["-v"])).toMatchObject({ options: { command: "version" } });
	});
});

describe("parseArchetypePicks", () => {
	it("takes ids and 1-based numbers in any separator, once each", () => {
		expect(parseArchetypePicks(" 1, backend 1 7 ")).toEqual({
			ok: true,
			ids: ["generalist", "backend", "chief-of-staff"],
		});
	});

	it("maps blank to the defaults and none to nobody", () => {
		expect(parseArchetypePicks("")).toEqual({ ok: true, ids: ["generalist"] });
		expect(parseArchetypePicks("NONE")).toEqual({ ok: true, ids: [] });
	});

	it("rejects numbers out of range", () => {
		expect(parseArchetypePicks("0").ok).toBe(false);
		expect(parseArchetypePicks("8").ok).toBe(false);
	});
});
