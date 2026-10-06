#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { z } from "zod";
import { detect } from "./detect.js";
import { childPath, execute } from "./execute.js";
import { type Options, parseOptions, USAGE } from "./options.js";
import { resolvePaths } from "./paths.js";
import { buildPlan, type Choices, type Environment } from "./plan.js";
import { type Asker, defaultsAsker, terminalAsker } from "./prompt.js";
import { formatPlan } from "./report.js";

const out = (text: string): void => {
	process.stdout.write(text);
};
const err = (text: string): void => {
	process.stderr.write(text);
};

function installerVersion(): string {
	const text = readFileSync(new URL("../package.json", import.meta.url), "utf8");
	return z.object({ version: z.string() }).parse(JSON.parse(text)).version;
}

async function choose(options: Options, env: Environment, asker: Asker): Promise<Choices> {
	const installed = env.tools.engineering ? " (already installed: runs its setup again)" : "";
	const engineering =
		options.engineering ??
		(await asker.confirm(
			`Also set up Jeremy's engineering toolkit (github.com/Kadajett/engineering)${installed}?`,
			false,
		));
	const archetypes = options.archetypes ?? (env.staffed ? [] : await asker.pickArchetypes());
	return { engineering, archetypes };
}

async function setup(options: Options): Promise<number> {
	const interactive = !options.yes && process.stdin.isTTY === true;
	if (!interactive && !options.yes && !options.dryRun) {
		err("Not a terminal, so nothing can be asked: re-run with --yes (or --dry-run).\n");
		return 2;
	}
	const paths = resolvePaths(homedir(), process.env);
	out("Checking this machine…\n\n");
	const env = await detect({
		paths,
		env: process.env,
		platform: process.platform,
		arch: process.arch,
	});
	const asker = interactive ? terminalAsker() : defaultsAsker;
	try {
		const plan = buildPlan(env, await choose(options, env, asker));
		out(`\n${formatPlan(plan, paths.home, options.dryRun)}`);
		if (plan.blockers.length > 0) return 1;
		if (options.dryRun || plan.steps.length === 0) return 0;
		if (!(await asker.confirm("Go ahead?", true))) return 1;
		const path = childPath([paths.binDir, env.privateNodeBin], process.env["PATH"] ?? "");
		if (!(await execute(plan, { asker, home: paths.home, path, out }))) return 1;
		out("\nDone. Open Dunder from your app menu, or run `dunder`.\n");
		return 0;
	} finally {
		asker.close();
	}
}

async function main(argv: readonly string[]): Promise<number> {
	const parsed = parseOptions(argv);
	if (!parsed.ok) {
		err(`dunder-ai: ${parsed.error}\n\n${USAGE}`);
		return 2;
	}
	const { options } = parsed;
	if (options.command === "help") out(USAGE);
	else if (options.command === "version") out(`${installerVersion()}\n`);
	else return setup(options);
	return 0;
}

main(process.argv.slice(2)).then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		err(`dunder-ai: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	},
);
