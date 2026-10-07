// office-update: ask Jeremy's Dunder app to roll forward onto the merged code.
//   office-update [--hotfix] ["<what changed>"]
// Runs under plain Node (type stripping), so it uses only Node built-ins; the
// app validates every line against `updateRequestLineSchema` (src/shared/app-update.ts).
// Agents' updates apply at most every 2 h (the app's batch window): a request inside
// the window waits for its end. --hotfix skips the window; then, as always, the update
// waits while Jeremy is busy and shows a 15-second countdown he can cancel.
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

const USAGE = 'usage: office-update [--hotfix] ["<what changed>"]\n';

function main(argv: readonly string[]): number {
	const hotfix = argv[0] === "--hotfix";
	const reason = (hotfix ? argv.slice(1) : argv).join(" ").trim();
	if (reason === "-h" || reason === "--help") {
		process.stdout.write(USAGE);
		return 0;
	}
	if (reason.startsWith("--")) {
		process.stderr.write(`office-update: unknown option ${reason.split(" ")[0]}\n${USAGE}`);
		return 2;
	}
	if (reason.length > 500) {
		process.stderr.write("office-update: reason is longer than 500 characters\n");
		return 2;
	}
	// The app knows the requester only by its pane. Without it Jeremy's countdown
	// says "someone" asked, so refuse rather than request anonymously.
	const fromPane = process.env["HERDR_PANE_ID"];
	if (!fromPane) {
		process.stderr.write(
			"office-update: HERDR_PANE_ID is not set, so Jeremy would not see who asked for the update. Nothing was requested. Run office-update from your bash tool in your office pane (omp's eval tool does not pass HERDR_PANE_ID).\n",
		);
		return 1;
	}
	const line = {
		v: 1,
		id: randomUUID(),
		fromPane,
		reason,
		...(hotfix ? { hotfix: true } : {}),
		requestedAt: new Date().toISOString(),
	};
	const path = updateRequestsPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	// One small O_APPEND write per request, so concurrent requesters never interleave.
	appendFileSync(path, `${JSON.stringify(line)}\n`);
	process.stdout.write(
		hotfix
			? "office-update: hotfix requested. If there are new commits, Dunder rebuilds and relaunches " +
					"in 15 s unless Jeremy cancels (it waits while he is busy). Your agents keep running.\n"
			: "office-update: requested. Agents' updates apply at most every 2 h: inside that window it " +
					"waits for the next batch (Jeremy sees 'N changes waiting'), otherwise Dunder rebuilds " +
					"and relaunches in 15 s unless he cancels. Your agents keep running.\n",
	);
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = main(process.argv.slice(2));
}
