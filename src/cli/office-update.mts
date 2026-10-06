// office-update: ask Jeremy's Dunder app to roll forward onto the merged code.
//   office-update ["<what changed>"]
// Runs under plain Node (type stripping), so it uses only Node built-ins; the
// app validates every line against `updateRequestLineSchema` (src/shared/app-update.ts),
// then shows a 15-second countdown Jeremy can cancel before it rebuilds and relaunches.
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Where agents drop update requests for the app. */
export function updateRequestsPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	const state = env["XDG_STATE_HOME"] || join(home, ".local", "state");
	return join(state, "dunder", "update-requests.ndjson");
}

function main(argv: readonly string[]): number {
	const reason = argv.join(" ").trim();
	if (reason === "-h" || reason === "--help") {
		process.stdout.write('usage: office-update ["<what changed>"]\n');
		return 0;
	}
	if (reason.length > 500) {
		process.stderr.write("office-update: reason is longer than 500 characters\n");
		return 2;
	}
	const line = {
		v: 1,
		id: randomUUID(),
		fromPane: process.env["HERDR_PANE_ID"],
		reason,
		requestedAt: new Date().toISOString(),
	};
	const path = updateRequestsPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	// One small O_APPEND write per request, so concurrent requesters never interleave.
	appendFileSync(path, `${JSON.stringify(line)}\n`);
	process.stdout.write(
		"office-update: requested. If there are new commits, Dunder rebuilds and relaunches " +
			"in 15 s unless Jeremy cancels. Your agents keep running.\n",
	);
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = main(process.argv.slice(2));
}
