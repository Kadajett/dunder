import { type ArchetypeId, archetype } from "./archetypes.js";
import { desktopEntry, launcherScript, type SeedPick, seedContent } from "./files.js";
import { ICON_SVG } from "./icon-svg.js";
import { type Paths, tildify } from "./paths.js";
import type { Release } from "./release.js";

export const TOOL_NAMES = [
	"git",
	"curl",
	"node",
	"npm",
	"herdr",
	"omp",
	"bd",
	"claude",
	"codex",
	"engineering",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface Tool {
	readonly path: string;
	readonly version?: string;
}

/** What `detect` found on this machine: the planner's only input besides the choices. */
export interface Environment {
	readonly platform: string;
	readonly arch: string;
	readonly paths: Paths;
	/** Tools on PATH (outside `privateNodeBin`, for node/npm). */
	readonly tools: Readonly<Partial<Record<ToolName, Tool>>>;
	/** A Node the curl installer fetched for this run (`DUNDER_NODE_BIN`), not on the user's PATH. */
	readonly privateNodeBin?: string;
	readonly binDirOnPath: boolean;
	/** Version of the installed AppImage, from its install record. */
	readonly installedVersion?: string;
	readonly appImagePresent: boolean;
	/** Undefined when neither the site nor GitHub answered. */
	readonly latest?: Release;
	/** Current contents of files setup writes (launcher, desktop entry, icon, seed); absent = missing. */
	readonly files: Readonly<Record<string, string>>;
	/** Current targets of symlinks setup makes; absent = no symlink there. */
	readonly links: Readonly<Record<string, string>>;
	/** A roster with agents exists, so a seed would never be applied. */
	readonly staffed: boolean;
	readonly engineeringCheckout: boolean;
}

export interface Choices {
	readonly engineering: boolean;
	readonly archetypes: readonly ArchetypeId[];
}

export type Action =
	| {
			readonly kind: "run";
			readonly command: string;
			readonly args: readonly string[];
			readonly cwd?: string;
			readonly timeoutMs: number;
	  }
	| {
			readonly kind: "install-app";
			/** Resolved again at install time when unknown now. */
			readonly release?: Release;
			readonly path: string;
			readonly record: string;
	  }
	| {
			readonly kind: "write";
			readonly path: string;
			readonly content: string;
			readonly mode: number;
	  }
	| { readonly kind: "link"; readonly target: string; readonly path: string };

export interface Step {
	readonly title: string;
	readonly action: Action;
	/** Asked before running unless `--yes`; declining skips just this step. */
	readonly consent?: string;
}

export interface Plan {
	/** Already in place. */
	readonly present: readonly string[];
	readonly steps: readonly Step[];
	/** Problems setup cannot fix; nothing runs while there are any. */
	readonly blockers: readonly string[];
	readonly notes: readonly string[];
}

const MINUTE = 60_000;
export const MIN_NODE_MAJOR = 22;
export const HERDR_INSTALL = "curl -fsSL https://herdr.dev/install.sh | sh";
export const ENGINEERING_REPO = "https://github.com/Kadajett/engineering.git";
const NPM_TOOLS = { omp: "@oh-my-pi/pi-coding-agent", bd: "@beads/bd" } as const;
const PRIVATE_NODE_COMMANDS = ["node", "npm", "npx"] as const;

interface Draft {
	present: string[];
	steps: Step[];
	blockers: string[];
	notes: string[];
}

export function nodeMajor(version: string | undefined): number {
	return Number(version?.replace(/^v/, "").split(".")[0] ?? Number.NaN);
}

function describeTool(name: string, tool: Tool, home: string): string {
	return `${name}${tool.version ? ` ${tool.version}` : ""} (${tildify(tool.path, home)})`;
}

function planBasics(env: Environment, draft: Draft): void {
	if (env.platform !== "linux" || env.arch !== "x64") {
		draft.blockers.push(`Dunder ships for Linux x64 only; this is ${env.platform} ${env.arch}`);
	}
	const { home } = env.paths;
	for (const name of ["git", "curl"] as const) {
		const tool = env.tools[name];
		if (tool) draft.present.push(describeTool(name, tool, home));
		else draft.blockers.push(`${name} is missing: install it with your package manager`);
	}
	planNode(env, draft);
}

function planNode(env: Environment, draft: Draft): void {
	const node = env.tools.node;
	if (node && nodeMajor(node.version) >= MIN_NODE_MAJOR) {
		draft.present.push(describeTool("node", node, env.paths.home));
		return;
	}
	if (!env.privateNodeBin) {
		const found = node ? `found ${node.version ?? "an unknown version"}` : "none found";
		draft.blockers.push(`Node ${MIN_NODE_MAJOR}+ is needed on PATH (${found}): see nodejs.org`);
		return;
	}
	for (const command of PRIVATE_NODE_COMMANDS) {
		const target = `${env.privateNodeBin}/${command}`;
		const path = `${env.paths.binDir}/${command}`;
		if (env.links[path] === target) continue;
		const title = `Put the downloaded ${command} on PATH: ${tildify(path, env.paths.home)}`;
		draft.steps.push({ title, action: { kind: "link", target, path } });
	}
}

function npmGlobal(env: Environment, spec: string): Action {
	const args = ["install", "--global", "--prefix", env.paths.localPrefix, spec];
	return { kind: "run", command: "npm", args, timeoutMs: 10 * MINUTE };
}

function planTools(env: Environment, draft: Draft): void {
	const { home } = env.paths;
	const herdr = env.tools.herdr;
	if (herdr) draft.present.push(describeTool("herdr", herdr, home));
	else {
		draft.steps.push({
			title: "Install herdr, the terminal multiplexer Dunder's agents run in",
			action: { kind: "run", command: "sh", args: ["-c", HERDR_INSTALL], timeoutMs: 5 * MINUTE },
			consent: `Install herdr with its official installer (${HERDR_INSTALL})?`,
		});
	}
	for (const name of ["omp", "bd"] as const) {
		const spec = NPM_TOOLS[name];
		const tool = env.tools[name];
		if (tool) {
			draft.present.push(describeTool(name, tool, home));
			continue;
		}
		draft.steps.push({
			title: `Install ${name} (${spec}) into ${tildify(env.paths.localPrefix, home)}`,
			action: npmGlobal(env, spec),
			consent: `Install ${name} with npm (${spec})?`,
		});
	}
}

interface FileWrite {
	readonly title: string;
	readonly path: string;
	readonly content: string;
	readonly mode: number;
}

function writeIfChanged(env: Environment, draft: Draft, file: FileWrite): void {
	const { title, path, content, mode } = file;
	const shown = tildify(path, env.paths.home);
	if (env.files[path] === content) draft.present.push(`${shown} is up to date`);
	else
		draft.steps.push({
			title: `${title}: ${shown}`,
			action: { kind: "write", path, content, mode },
		});
}

function planApp(env: Environment, draft: Draft): void {
	const { paths, latest } = env;
	const shown = tildify(paths.appImage, paths.home);
	const installed = env.appImagePresent ? env.installedVersion : undefined;
	if (installed !== undefined && (latest === undefined || latest.version === installed)) {
		draft.present.push(`Dunder ${installed} (${shown})`);
		if (!latest) draft.notes.push("Could not check for a newer Dunder release right now.");
		return;
	}
	const target = latest ? `Dunder ${latest.version}` : "the latest Dunder";
	const verb = installed === undefined ? "Install" : `Update Dunder ${installed} →`;
	const { appImage: path, installRecord: record } = paths;
	const action: Action = latest
		? { kind: "install-app", release: latest, path, record }
		: { kind: "install-app", path, record };
	draft.steps.push({ title: `${verb} ${target} at ${shown}`, action });
	if (!latest) {
		draft.notes.push(
			"The Dunder release server did not answer just now; setup asks again when it installs.",
		);
	}
}

function planDesktop(env: Environment, draft: Draft): void {
	const { paths } = env;
	const files: FileWrite[] = [
		{
			title: "Launcher",
			path: paths.launcher,
			content: launcherScript(paths.appImage),
			mode: 0o755,
		},
		{ title: "Icon", path: paths.icon, content: ICON_SVG, mode: 0o644 },
		{
			title: "Menu entry",
			path: paths.desktopEntry,
			content: desktopEntry(paths.launcher, paths.icon),
			mode: 0o644,
		},
	];
	for (const file of files) writeIfChanged(env, draft, file);
	if (!env.binDirOnPath) {
		draft.notes.push(
			`Add ${tildify(paths.binDir, paths.home)} to PATH to run \`dunder\` from a shell.`,
		);
	}
}

function run(command: string, args: readonly string[], timeoutMs: number, cwd?: string): Action {
	return cwd === undefined
		? { kind: "run", command, args, timeoutMs }
		: { kind: "run", command, args, cwd, timeoutMs };
}

function planEngineering(env: Environment, choices: Choices, draft: Draft): void {
	const { paths } = env;
	const tool = env.tools.engineering;
	const ours = tool?.path === `${paths.binDir}/engineering` && env.engineeringCheckout;
	if (!choices.engineering) {
		if (tool) draft.present.push(describeTool("engineering", tool, paths.home));
		return;
	}
	const checkout = paths.engineeringCheckout;
	const shown = tildify(checkout, paths.home);
	if (tool && !ours) draft.present.push(describeTool("engineering", tool, paths.home));
	else {
		const fetch = env.engineeringCheckout
			? run("git", ["-C", checkout, "pull", "--ff-only"], 5 * MINUTE)
			: run("git", ["clone", ENGINEERING_REPO, checkout], 5 * MINUTE);
		const verb = env.engineeringCheckout ? "Update" : "Clone";
		draft.steps.push(
			{ title: `${verb} the engineering toolkit at ${shown}`, action: fetch },
			{ title: "Install its dependencies", action: run("npm", ["ci"], 10 * MINUTE, checkout) },
			{ title: "Install the `engineering` command", action: npmGlobal(env, checkout) },
		);
	}
	const command = tool && !ours ? tool.path : `${paths.binDir}/engineering`;
	draft.steps.push({
		title: "Set up the toolkit's tools (Beads, Graphify, Lizard; it asks before each)",
		action: run(command, ["setup"], 30 * MINUTE),
	});
}

/** Each pick's harness, falling back to omp (which setup installs) when the suggestion is missing. */
function seedPicks(env: Environment, ids: readonly ArchetypeId[], notes: string[]): SeedPick[] {
	return ids.map((id): SeedPick => {
		const { harness, name } = archetype(id);
		if (harness === "omp" || env.tools[harness]) return { id, harness };
		notes.push(`${name} (${id}) suggests ${harness}, which is not installed; seeding with omp.`);
		return { id, harness: "omp" };
	});
}

function planSeed(env: Environment, choices: Choices, draft: Draft): void {
	if (env.staffed) {
		draft.present.push("The office already has staff (archetypes only seed a new office)");
		return;
	}
	if (choices.archetypes.length === 0) return;
	const content = seedContent(seedPicks(env, choices.archetypes, draft.notes), env.paths.home);
	const names = choices.archetypes.map((id) => `${archetype(id).name} (${id})`).join(", ");
	const step = { title: `Starting staff, ${names}`, path: env.paths.seed, content, mode: 0o644 };
	writeIfChanged(env, draft, step);
}

/** Everything setup would do on this machine, in order. Pure: `detect` gathers the input. */
export function buildPlan(env: Environment, choices: Choices): Plan {
	const draft: Draft = { present: [], steps: [], blockers: [], notes: [] };
	planBasics(env, draft);
	planTools(env, draft);
	planApp(env, draft);
	planDesktop(env, draft);
	planEngineering(env, choices, draft);
	planSeed(env, choices, draft);
	return draft;
}
