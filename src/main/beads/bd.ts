import { execFile } from "node:child_process";

/** Upper bound on one `bd` run. */
const BD_TIMEOUT_MS = 10_000;

/** Runs `bd`; how main reads and writes a project's Beads. */
export type BdRunner = (args: readonly string[], cwd: string) => Promise<string>;

/** Run `bd <args>` in `cwd`; resolves with stdout, rejects with bd's stderr (or the exec error). */
export function runBd(args: readonly string[], cwd: string): Promise<string> {
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
