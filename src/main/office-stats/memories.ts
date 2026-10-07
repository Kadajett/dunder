import { basename } from "node:path";
import type { Roster } from "@shared/company/roster";
import type {
	CompanyMemories,
	CompanyMemory,
	MemoryProject,
	StatsActionResult,
} from "@shared/office-stats";
import { z } from "zod";
import { runBd } from "../beads/bd";

/**
 * `bd memories --json` prints one object: memory key → text, alongside
 * bookkeeping such as `schema_version` (a number). Only string entries are memories.
 */
const memoriesOutputSchema = z.record(z.string(), z.unknown());

/** Parse `bd memories --json` stdout into memories sorted by key. */
export function parseMemories(stdout: string): CompanyMemory[] {
	const parsed = memoriesOutputSchema.parse(JSON.parse(stdout));
	return Object.entries(parsed)
		.flatMap(([key, text]) => (typeof text === "string" ? [{ key, text }] : []))
		.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * The company's projects: every distinct cwd of a worker still on the
 * roster, in roster order, then the app root unless a worker already uses it.
 */
export function memoryProjects(roster: Roster | undefined, appRoot: string): string[] {
	const cwds = new Set<string>();
	for (const agent of roster?.agents ?? []) if (!agent.firedAt) cwds.add(agent.cwd);
	cwds.add(appRoot);
	return [...cwds];
}

export type RememberPlan =
	| { readonly ok: true; readonly args: readonly string[] }
	| { readonly ok: false; readonly reason: string };

/**
 * `bd remember` arguments. Without `--key`, a single word naming an existing
 * memory would be recalled instead of stored, so keyless memories must be
 * sentences. `--` keeps text that starts with a dash from reading as a flag.
 */
export function rememberPlan(text: string, key: string | undefined): RememberPlan {
	if (!key && !/\s/.test(text)) {
		return { ok: false, reason: "write a sentence, or give a one-word memory a key" };
	}
	return { ok: true, args: ["remember", ...(key ? ["--key", key] : []), "--", text] };
}

async function loadProject(cwd: string): Promise<MemoryProject> {
	const name = basename(cwd) || cwd;
	try {
		const memories = parseMemories(await runBd(["memories", "--json"], cwd));
		return { state: "ok", cwd, name, memories };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { state: "unavailable", cwd, name, reason };
	}
}

/** Every project's Beads memories, read in parallel. */
export async function loadCompanyMemories(cwds: readonly string[]): Promise<CompanyMemories> {
	return { projects: await Promise.all(cwds.map(loadProject)) };
}

async function runEdit(args: readonly string[], cwd: string): Promise<StatsActionResult> {
	try {
		await runBd(args, cwd);
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

/** `bd remember "<text>" [--key <key>]` in a project. */
export function remember(
	cwd: string,
	text: string,
	key: string | undefined,
): Promise<StatsActionResult> {
	const plan = rememberPlan(text, key);
	return plan.ok ? runEdit(plan.args, cwd) : Promise.resolve(plan);
}

/** `bd forget <key>` in a project. */
export function forget(cwd: string, key: string): Promise<StatsActionResult> {
	return runEdit(["forget", "--", key], cwd);
}
