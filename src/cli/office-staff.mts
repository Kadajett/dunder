// office-staff: the chief of staff hires, fires, restarts and re-models workers from the shell.
//   office-staff hire <name> --role <role> [--model <selector[:thinking]>] [--harness omp|claude|codex]
//                     [--room <room>] [--cwd <dir>] [--brief "<extra brief>"]
//   office-staff fire <name>
//   office-staff restart <name>
//   office-staff model <name> <selector[:thinking]>
//   office-staff list
// Runs under plain Node (type stripping), so it uses only Node built-ins. The app
// validates every line against `staffRequestLineSchema` (src/shared/staff.ts),
// honours only the chief of staff's pane, and answers in the results file.
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

type Env = Readonly<Record<string, string | undefined>>;

const USAGE = `usage:
  office-staff hire <name> --role <role> [--model <selector[:thinking]>] [--harness omp|claude|codex]
                    [--room <room>] [--cwd <dir>] [--brief "<extra brief>"]
  office-staff fire <name>
  office-staff restart <name>
  office-staff model <name> <selector[:thinking]>
  office-staff list
`;
/** How long to wait for the app's answer before leaving it to the Activity Feed. */
const DEFAULT_WAIT_MS = 30_000;
const POLL_MS = 250;

function stateDir(env: Env, home: string): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder");
}

/** Where `office-staff` drops requests for the app. */
export function staffRequestsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "staff-requests.ndjson");
}

/** Where the app answers them, one line per handled request id. */
export function staffResultsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "staff-results.ndjson");
}

class UsageError extends Error {}

const HIRE_OPTIONS = {
	role: { type: "string" },
	model: { type: "string" },
	harness: { type: "string" },
	room: { type: "string" },
	cwd: { type: "string" },
	brief: { type: "string" },
} as const;

function parseHire(args: readonly string[]): Record<string, string> {
	const { values, positionals } = parseArgs({
		args: [...args],
		options: HIRE_OPTIONS,
		allowPositionals: true,
	});
	const [name, ...extra] = positionals;
	if (!name || extra.length > 0) throw new UsageError("hire takes exactly one name");
	if (!values.role) throw new UsageError("hire needs --role");
	const fields = Object.entries(values).filter(
		(entry): entry is [string, string] => entry[1] !== undefined,
	);
	return { action: "hire", name, ...Object.fromEntries(fields) };
}

/** The `request` object for the line, or a UsageError. */
function parseCommand(argv: readonly string[]): Record<string, string> {
	const [command, ...args] = argv;
	const exactly = (count: number): readonly string[] => {
		if (args.length !== count) throw new UsageError(`${command} takes ${count} argument(s)`);
		return args;
	};
	switch (command) {
		case "hire":
			return parseHire(args);
		case "fire":
		case "restart": {
			const [name = ""] = exactly(1);
			return { action: command, name };
		}
		case "model": {
			const [name = "", model = ""] = exactly(2);
			return { action: "model", name, model };
		}
		case "list":
			exactly(0);
			return { action: "list" };
		default:
			throw new UsageError(command ? `unknown command: ${command}` : "missing command");
	}
}

/** The results file and its rotated generation (`<path>.1`; the app rotates it past 256 KB). */
function readResults(path: string): string {
	const read = (file: string): string => {
		try {
			return readFileSync(file, "utf8");
		} catch {
			return "";
		}
	};
	return `${read(path)}\n${read(`${path}.1`)}`;
}

function findResult(path: string, id: string): { ok: boolean; message: string } | undefined {
	const text = readResults(path);
	for (const line of text.split("\n")) {
		if (!line.includes(id)) continue;
		let result: unknown;
		try {
			result = JSON.parse(line);
		} catch {
			// A line the app is still writing; the next poll reads it whole.
			continue;
		}
		if (typeof result !== "object" || result === null || !("id" in result) || result.id !== id)
			continue;
		const ok = "ok" in result && result.ok === true;
		const message = "message" in result && typeof result.message === "string" ? result.message : "";
		return { ok, message };
	}
	return undefined;
}

async function awaitResult(path: string, id: string, waitMs: number): Promise<number> {
	for (let waited = 0; ; waited += POLL_MS) {
		const result = findResult(path, id);
		if (result) {
			(result.ok ? process.stdout : process.stderr).write(`office-staff: ${result.message}\n`);
			return result.ok ? 0 : 1;
		}
		if (waited >= waitMs) break;
		await sleep(POLL_MS);
	}
	process.stdout.write(
		"office-staff: requested, but Dunder has not answered yet. The outcome will show in the Activity Feed (is the app running?).\n",
	);
	return 0;
}

async function main(argv: readonly string[]): Promise<number> {
	if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
		process.stdout.write(USAGE);
		return argv.length === 0 ? 2 : 0;
	}
	let request: Record<string, string>;
	try {
		request = parseCommand(argv);
	} catch (error) {
		if (!(error instanceof UsageError) && !(error instanceof TypeError)) throw error;
		process.stderr.write(`office-staff: ${error.message}\n${USAGE}`);
		return 2;
	}
	// Only the chief of staff's pane is honoured, and the app knows panes only by HERDR_PANE_ID.
	const fromPane = process.env["HERDR_PANE_ID"];
	if (!fromPane) {
		process.stderr.write(
			"office-staff: HERDR_PANE_ID is not set, so the office cannot tell who is asking. Nothing was requested. Run office-staff from your bash tool in your office pane (omp's eval tool does not pass HERDR_PANE_ID).\n",
		);
		return 1;
	}
	const id = randomUUID();
	const line = { v: 1, id, fromPane, requestedAt: new Date().toISOString(), request };
	const path = staffRequestsPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	// One small O_APPEND write per request, so concurrent requesters never interleave.
	appendFileSync(path, `${JSON.stringify(line)}\n`);
	const wait = Number(process.env["OFFICE_STAFF_WAIT_MS"] ?? DEFAULT_WAIT_MS);
	return awaitResult(
		staffResultsPath(process.env, homedir()),
		id,
		Number.isFinite(wait) ? wait : DEFAULT_WAIT_MS,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await main(process.argv.slice(2));
}
