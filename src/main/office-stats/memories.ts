import { execFile } from "node:child_process";
import type { CompanyMemory, MemoriesResult } from "@shared/office-stats";
import { z } from "zod";

/** Upper bound on one `bd memories` run. */
const BD_TIMEOUT_MS = 10_000;

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

function runBd(args: readonly string[], cwd: string): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	execFile(
		"bd",
		[...args],
		{ cwd, timeout: BD_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
		(error, stdout, stderr) => {
			if (error) reject(new Error(stderr.trim() || error.message, { cause: error }));
			else resolve(stdout);
		},
	);
	return promise;
}

/** The company's Beads memories, read in `cwd` (the office agents' project). */
export async function loadMemories(cwd: string): Promise<MemoriesResult> {
	try {
		return { state: "ok", cwd, memories: parseMemories(await runBd(["memories", "--json"], cwd)) };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return { state: "unavailable", cwd, reason };
	}
}
