import { describe, expect, it } from "vitest";
import { desktopEntry, launcherScript } from "./files.js";
import { ICON_SVG } from "./icon-svg.js";
import { resolvePaths } from "./paths.js";
import { buildPlan, type Choices, type Environment } from "./plan.js";

const paths = resolvePaths("/home/me", {});
const RELEASE = {
	version: "0.2.0",
	url: "https://example.test/D.AppImage",
	source: "site",
} as const;

/** A machine with everything already set up. */
const READY: Environment = {
	platform: "linux",
	arch: "x64",
	paths,
	tools: {
		git: { path: "/usr/bin/git", version: "2.53.0" },
		curl: { path: "/usr/bin/curl", version: "8.18.0" },
		node: { path: "/usr/bin/node", version: "22.23.2" },
		npm: { path: "/usr/bin/npm", version: "10.9.0" },
		herdr: { path: "/home/me/.local/bin/herdr", version: "0.9.3" },
		omp: { path: "/home/me/.local/bin/omp", version: "18.4.9" },
		bd: { path: "/home/me/.local/bin/bd", version: "1.1.2" },
	},
	binDirOnPath: true,
	installedVersion: "0.2.0",
	appImagePresent: true,
	latest: RELEASE,
	files: {
		[paths.launcher]: launcherScript(paths.appImage),
		[paths.desktopEntry]: desktopEntry(paths.launcher, paths.icon),
		[paths.icon]: ICON_SVG,
	},
	links: {},
	staffed: true,
	engineeringCheckout: false,
};
const NOTHING: Choices = { engineering: false, archetypes: [] };

const titles = (env: Environment, choices = NOTHING) =>
	buildPlan(env, choices).steps.map((s) => s.title);

describe("buildPlan", () => {
	it("has nothing to do on a machine that is already set up", () => {
		const plan = buildPlan(READY, NOTHING);
		expect(plan.steps).toEqual([]);
		expect(plan.blockers).toEqual([]);
		expect(plan.present).toContain("Dunder 0.2.0 (~/.local/share/dunder/Dunder.AppImage)");
	});

	it("installs missing tools, each behind its own consent", () => {
		const { herdr: _h, omp: _o, bd: _b, ...rest } = READY.tools;
		const plan = buildPlan({ ...READY, tools: rest }, NOTHING);
		expect(
			plan.steps.map((s) => [s.action.kind === "run" && s.action.args.at(-1), !!s.consent]),
		).toEqual([
			["curl -fsSL https://herdr.dev/install.sh | sh", true],
			["@oh-my-pi/pi-coding-agent", true],
			["@beads/bd", true],
		]);
		const omp = plan.steps[1]?.action;
		expect(omp?.kind === "run" && omp.args).toEqual([
			"install",
			"--global",
			"--prefix",
			"/home/me/.local",
			"@oh-my-pi/pi-coding-agent",
		]);
	});

	it("updates an outdated app, rewrites only changed files, and skips an up-to-date one", () => {
		const env = {
			...READY,
			installedVersion: "0.1.0",
			files: { ...READY.files, [paths.launcher]: "#!/bin/sh\nold\n" },
		};
		expect(titles(env)).toEqual([
			"Update Dunder 0.1.0 → Dunder 0.2.0 at ~/.local/share/dunder/Dunder.AppImage",
			"Launcher: ~/.local/bin/dunder",
		]);
		const install = buildPlan(env, NOTHING).steps[0]?.action;
		expect(install?.kind === "install-app" && install.release).toEqual(RELEASE);
	});

	it("keeps the installed app when the release server is unreachable, but installs when absent", () => {
		const { latest: _l, ...offline } = READY;
		expect(titles(offline)).toEqual([]);
		expect(titles({ ...offline, appImagePresent: false })).toEqual([
			"Install the latest Dunder at ~/.local/share/dunder/Dunder.AppImage",
		]);
	});

	it("blocks on what it cannot install: other platforms, git, curl, an old node", () => {
		const { git: _g, curl: _c, ...tools } = READY.tools;
		const env = {
			...READY,
			platform: "darwin",
			tools: { ...tools, node: { path: "/n", version: "20.1.0" } },
		};
		expect(buildPlan(env, NOTHING).blockers).toEqual([
			"Dunder ships for Linux x64 only; this is darwin x64",
			"git is missing: install it with your package manager",
			"curl is missing: install it with your package manager",
			"Node 22+ is needed on PATH (found 20.1.0): see nodejs.org",
		]);
	});

	it("links the curl installer's private node onto PATH instead of blocking", () => {
		const { node: _n, ...tools } = READY.tools;
		const env = {
			...READY,
			tools,
			privateNodeBin: "/home/me/.local/share/dunder/node/bin",
			links: { "/home/me/.local/bin/npx": "/home/me/.local/share/dunder/node/bin/npx" },
		};
		const plan = buildPlan(env, NOTHING);
		expect(plan.blockers).toEqual([]);
		expect(plan.steps.map((s) => s.action)).toEqual([
			{
				kind: "link",
				target: "/home/me/.local/share/dunder/node/bin/node",
				path: "/home/me/.local/bin/node",
			},
			{
				kind: "link",
				target: "/home/me/.local/share/dunder/node/bin/npm",
				path: "/home/me/.local/bin/npm",
			},
		]);
	});

	it("installs the engineering toolkit from a fresh clone, or updates its own checkout", () => {
		const fresh = buildPlan(READY, { ...NOTHING, engineering: true }).steps.map((s) => s.action);
		expect(
			fresh.map((a) => a.kind === "run" && [a.command, ...a.args].slice(0, 2).join(" ")),
		).toEqual(["git clone", "npm ci", "npm install", "/home/me/.local/bin/engineering setup"]);
		const ours = {
			...READY,
			engineeringCheckout: true,
			tools: { ...READY.tools, engineering: { path: "/home/me/.local/bin/engineering" } },
		};
		const update = buildPlan(ours, { ...NOTHING, engineering: true }).steps[0]?.action;
		expect(update?.kind === "run" && update.args).toEqual([
			"-C",
			"/home/me/.local/share/dunder/engineering",
			"pull",
			"--ff-only",
		]);
	});

	it("runs only `engineering setup` when the toolkit was installed some other way", () => {
		const env = {
			...READY,
			tools: { ...READY.tools, engineering: { path: "/opt/bin/engineering" } },
		};
		expect(titles(env, { ...NOTHING, engineering: true })).toEqual([
			"Set up the toolkit's tools (Beads, Graphify, Lizard; it asks before each)",
		]);
	});

	it("seeds a new office with the picks, falling back to omp for a missing harness", () => {
		const plan = buildPlan(
			{ ...READY, staffed: false },
			{ engineering: false, archetypes: ["reviewer", "ops"] },
		);
		const write = plan.steps[0]?.action;
		expect(write?.kind === "write" && write.path).toBe("/home/me/.config/Dunder/seed.json");
		const seed = JSON.parse(write?.kind === "write" ? write.content : "{}");
		expect(seed.agents.map((a: { name: string; harness: string }) => [a.name, a.harness])).toEqual([
			["angela", "omp"],
			["darryl", "omp"],
		]);
		expect(plan.notes).toContain(
			"angela (reviewer) suggests claude, which is not installed; seeding with omp.",
		);
	});

	it("never seeds an office that already has staff, and leaves an identical seed alone", () => {
		const choices: Choices = { engineering: false, archetypes: ["generalist"] };
		expect(titles(READY, choices)).toEqual([]);
		const first = buildPlan({ ...READY, staffed: false }, choices).steps[0]?.action;
		const content = first?.kind === "write" ? first.content : "";
		const again = { ...READY, staffed: false, files: { ...READY.files, [paths.seed]: content } };
		expect(titles(again, choices)).toEqual([]);
	});
});
