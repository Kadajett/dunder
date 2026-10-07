import { stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * A cheap "did a bd write happen" check for the repo at `cwd`: bd touches
 * `.beads/last-touched` on creates and updates and appends to
 * `interactions.jsonl` on closes, and a read touches neither (reads do touch
 * Dolt's own files, so those can't be watched). Comments move neither, so
 * callers still read bd now and then regardless. A missing file stamps as "-".
 */
export async function beadsStamp(cwd: string): Promise<string> {
	const parts = await Promise.all(
		["last-touched", "interactions.jsonl"].map((file) =>
			stat(join(cwd, ".beads", file)).then(
				(info) => `${info.mtimeMs}:${info.size}`,
				() => "-",
			),
		),
	);
	return parts.join("|");
}
