// office-board: put sticky notes and text on the office whiteboard, or read it.
//   office-board note "<text>" [--color yellow|green|blue|pink] [--x <n> --y <n>]
//   office-board text "<text>" [--x <n> --y <n>]
//   office-board read
//   office-board clear            (the chief of staff only)
// Runs under plain Node (type stripping), so it uses only Node built-ins. Writes
// append one request line that the app validates against `boardRequestLineSchema`
// (src/shared/whiteboard.ts); `read` prints the digest the app keeps up to date.
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

type Env = Readonly<Record<string, string | undefined>>;

function stateDir(env: Env, home: string): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder");
}

/** Where agents drop board requests for the app. */
export function boardRequestsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "board-requests.ndjson");
}

/** Where the app keeps the board as text for `office-board read`. */
export function boardDigestPath(env: Env, home: string): string {
	return join(stateDir(env, home), "board.json");
}

const USAGE = `usage:
  office-board note "<text>" [--color yellow|green|blue|pink] [--x <n> --y <n>]
  office-board text "<text>" [--x <n> --y <n>]
  office-board read
  office-board clear   (the chief of staff only)
`;
const COLORS = ["yellow", "green", "blue", "pink"];
const TEXT_MAX = 2_000;

function fail(message: string, code = 2): number {
	process.stderr.write(`office-board: ${message}\n`);
	return code;
}

function append(line: Record<string, unknown>): void {
	const path = boardRequestsPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	// One small O_APPEND write per request, so concurrent agents never interleave.
	appendFileSync(path, `${JSON.stringify(line)}\n`);
}

function position(values: { readonly x?: string; readonly y?: string }): object | string {
	if (values.x === undefined && values.y === undefined) return {};
	const x = Number(values.x);
	const y = Number(values.y);
	if (!Number.isFinite(x) || !Number.isFinite(y)) return "--x and --y must both be numbers";
	return { x, y };
}

/** `--x -20` as `--x=-20`: parseArgs would otherwise read the negative number as a flag. */
function joinNegatives(argv: readonly string[]): string[] {
	return argv.flatMap((arg, index) => {
		const value = argv[index + 1];
		if ((arg === "--x" || arg === "--y") && value !== undefined && /^-\d/.test(value))
			return [`${arg}=${value}`];
		const previous = argv[index - 1];
		const joined = (previous === "--x" || previous === "--y") && /^-\d/.test(arg);
		return joined ? [] : [arg];
	});
}

function post(op: "note" | "text", argv: readonly string[], fromPane: string): number {
	const { values, positionals } = parseArgs({
		args: joinNegatives(argv),
		allowPositionals: true,
		options: { color: { type: "string" }, x: { type: "string" }, y: { type: "string" } },
	});
	const text = positionals.join(" ").trim();
	if (text.length === 0) return fail(`nothing to post\n${USAGE}`);
	if (text.length > TEXT_MAX) return fail(`text is longer than ${TEXT_MAX} characters`);
	if (values.color !== undefined && (op === "text" || !COLORS.includes(values.color)))
		return fail(`--color is one of ${COLORS.join(", ")}, for notes only`);
	const at = position(values);
	if (typeof at === "string") return fail(at);
	const color = values.color === undefined ? {} : { color: values.color };
	const request = { v: 1, id: randomUUID(), fromPane, op, text, ...color, ...at };
	append({ ...request, requestedAt: new Date().toISOString() });
	process.stdout.write(
		`office-board: ${op} posted; it shows on the board as soon as Dunder reads it.\n`,
	);
	return 0;
}

interface DigestItem {
	readonly kind: string;
	readonly author: string;
	readonly text: string;
}

function isDigestItem(value: unknown): value is DigestItem {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		typeof value.kind === "string" &&
		"author" in value &&
		typeof value.author === "string" &&
		"text" in value &&
		typeof value.text === "string"
	);
}

/** The digest's items, or undefined when the file is not a digest the app wrote. */
function digestItems(text: string): readonly DigestItem[] | undefined {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof json !== "object" || json === null || !("items" in json)) return undefined;
	return Array.isArray(json.items) ? json.items.filter(isDigestItem) : undefined;
}

function read(): number {
	let text: string;
	try {
		text = readFileSync(boardDigestPath(process.env, homedir()), "utf8");
	} catch {
		process.stdout.write("The board is empty (Dunder has not written it yet).\n");
		return 0;
	}
	const items = digestItems(text);
	if (!items) return fail("the board digest is unreadable", 1);
	if (items.length === 0) {
		process.stdout.write("The board is empty.\n");
		return 0;
	}
	const lines = items.map(
		(item) => `- [${item.kind}] ${item.author}: ${item.text.replaceAll("\n", "\n    ")}`,
	);
	process.stdout.write(`${lines.join("\n")}\n`);
	return 0;
}

function main(argv: readonly string[]): number {
	const [command, ...rest] = argv;
	if (command === "read") return read();
	if (command !== "note" && command !== "text" && command !== "clear") {
		const help = command === "-h" || command === "--help";
		process[help ? "stdout" : "stderr"].write(USAGE);
		return help ? 0 : 2;
	}
	// The board signs every post with its author, known only by the pane.
	const fromPane = process.env["HERDR_PANE_ID"];
	if (!fromPane) {
		return fail(
			"HERDR_PANE_ID is not set, so the board would not know who posted this. Nothing was posted. Run office-board from your bash tool in your office pane (omp's eval tool does not pass HERDR_PANE_ID).",
			1,
		);
	}
	if (command !== "clear") return post(command, rest, fromPane);
	append({ v: 1, id: randomUUID(), fromPane, op: "clear", requestedAt: new Date().toISOString() });
	process.stdout.write(
		"office-board: clear requested. Dunder clears the board only if you are the chief of staff.\n",
	);
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		process.exitCode = main(process.argv.slice(2));
	} catch (error) {
		// parseArgs rejects unknown flags.
		process.exitCode = fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
	}
}
