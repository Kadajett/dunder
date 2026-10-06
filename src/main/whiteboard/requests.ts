import { join } from "node:path";
import { type BoardRequestLine, boardRequestLineSchema } from "@shared/whiteboard";

/** `<state>/dunder`, where the office CLIs and the app exchange files. */
function stateDir(env: Readonly<Record<string, string | undefined>>, home: string): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder");
}

/**
 * Must match `boardRequestsPath` in src/cli/office-board.mts, which cannot
 * import app code (it runs under plain Node); requests.test.ts keeps them in step.
 */
export function officeBoardRequestsPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	return join(stateDir(env, home), "board-requests.ndjson");
}

/** Must match `boardDigestPath` in src/cli/office-board.mts (same test). */
export function officeBoardDigestPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	return join(stateDir(env, home), "board.json");
}

/** Well-formed requests among newly appended lines; anything else is skipped. */
export function parseBoardRequests(lines: readonly string[]): BoardRequestLine[] {
	return lines.flatMap((line) => {
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			return [];
		}
		const parsed = boardRequestLineSchema.safeParse(json);
		return parsed.success ? [parsed.data] : [];
	});
}
