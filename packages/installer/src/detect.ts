import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readlink, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { z } from "zod";
import { resolveLatest } from "./net.js";
import type { Env, Paths } from "./paths.js";
import { type Environment, TOOL_NAMES, type Tool, type ToolName } from "./plan.js";

const VERSION_TIMEOUT_MS = 5_000;

export interface DetectInput {
	readonly paths: Paths;
	readonly env: Env;
	readonly platform: string;
	readonly arch: string;
	/** Skip the network: `latest` stays unknown. */
	readonly offline?: boolean;
}

async function isExecutable(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

/** The first executable `name` on `dirs`, like `command -v`. */
async function which(name: string, dirs: readonly string[]): Promise<string | undefined> {
	for (const dir of dirs) {
		const path = join(dir, name);
		if (await isExecutable(path)) return path;
	}
	return undefined;
}

/** First `x.y[.z]` in `<path> --version`, or undefined when it prints none in time. */
function versionOf(path: string): Promise<string | undefined> {
	const { promise, resolve } = Promise.withResolvers<string | undefined>();
	execFile(path, ["--version"], { timeout: VERSION_TIMEOUT_MS }, (error, stdout) => {
		resolve(error ? undefined : /\d+\.\d+(?:\.\d+)?/.exec(stdout)?.[0]);
	});
	return promise;
}

async function findTool(name: ToolName, dirs: readonly string[]): Promise<Tool | undefined> {
	const path = await which(name, dirs);
	if (path === undefined) return undefined;
	const version = name === "engineering" ? undefined : await versionOf(path);
	return version === undefined ? { path } : { path, version };
}

async function readText(path: string): Promise<string | undefined> {
	return readFile(path, "utf8").catch(() => undefined);
}

const installRecordSchema = z.object({ version: z.string().min(1) });
const rosterSchema = z.object({ agents: z.array(z.unknown()) });

async function parsed<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
	const text = await readText(path);
	if (text === undefined) return undefined;
	try {
		const result = schema.safeParse(JSON.parse(text));
		return result.success ? result.data : undefined;
	} catch {
		return undefined;
	}
}

async function detectTools(dirs: readonly string[]): Promise<Environment["tools"]> {
	const tools: Partial<Record<ToolName, Tool>> = {};
	await Promise.all(
		TOOL_NAMES.map(async (name) => {
			const tool = await findTool(name, dirs);
			if (tool) tools[name] = tool;
		}),
	);
	return tools;
}

async function snapshotFiles(paths: Paths): Promise<{
	files: Record<string, string>;
	links: Record<string, string>;
}> {
	const files: Record<string, string> = {};
	for (const path of [paths.launcher, paths.desktopEntry, paths.icon, paths.seed]) {
		const text = await readText(path);
		if (text !== undefined) files[path] = text;
	}
	const links: Record<string, string> = {};
	for (const command of ["node", "npm", "npx"]) {
		const path = join(paths.binDir, command);
		const target = await readlink(path).catch(() => undefined);
		if (target !== undefined) links[path] = target;
	}
	return { files, links };
}

async function isStaffed(paths: Paths): Promise<boolean> {
	const rosters = await Promise.all(paths.rosters.map((path) => parsed(path, rosterSchema)));
	return rosters.some((roster) => (roster?.agents.length ?? 0) > 0);
}

/** Everything the planner needs, read without changing anything. */
export async function detect(input: DetectInput): Promise<Environment> {
	const { paths, env } = input;
	const privateNodeBin = env["DUNDER_NODE_BIN"] || undefined;
	const pathDirs = (env["PATH"] ?? "").split(delimiter).filter(Boolean);
	const userDirs = pathDirs.filter((dir) => dir !== privateNodeBin);
	const [tools, record, appImagePresent, snapshot, staffed, engineeringCheckout, latest] =
		await Promise.all([
			detectTools([...userDirs, paths.binDir]),
			parsed(paths.installRecord, installRecordSchema),
			isExecutable(paths.appImage),
			snapshotFiles(paths),
			isStaffed(paths),
			stat(join(paths.engineeringCheckout, ".git")).then(
				() => true,
				() => false,
			),
			input.offline ? Promise.resolve(undefined) : resolveLatest(),
		]);
	return {
		platform: input.platform,
		arch: input.arch,
		paths,
		tools,
		...(privateNodeBin === undefined ? {} : { privateNodeBin }),
		binDirOnPath: userDirs.includes(paths.binDir),
		...(record === undefined ? {} : { installedVersion: record.version }),
		appImagePresent,
		...(latest === undefined ? {} : { latest }),
		...snapshot,
		staffed,
		engineeringCheckout,
	};
}
