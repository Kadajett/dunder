// office-brainstorm: gather the office at the whiteboard on a topic, or send everyone back.
//   office-brainstorm start "<topic>"
//   office-brainstorm end
// The chief of staff's tool (the app ignores anyone else's request). Runs under plain
// Node (type stripping), so it uses only Node built-ins; each command appends one
// request line that the app validates against `brainstormRequestLineSchema`
// (src/shared/brainstorm.ts).
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

type Env = Readonly<Record<string, string | undefined>>;

/** Where the chief drops brainstorm requests for the app. */
export function brainstormRequestsPath(env: Env, home: string): string {
	return join(
		env["XDG_STATE_HOME"] || join(home, ".local", "state"),
		"dunder",
		"brainstorm-requests.ndjson",
	);
}

const USAGE = `usage:
  office-brainstorm start "<topic>"
  office-brainstorm end
`;
const TOPIC_MAX = 200;

function fail(message: string, code = 2): number {
	process.stderr.write(`office-brainstorm: ${message}\n`);
	return code;
}

function append(line: Record<string, unknown>): void {
	const path = brainstormRequestsPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, `${JSON.stringify({ ...line, requestedAt: new Date().toISOString() })}\n`);
}

function main(argv: readonly string[]): number {
	const [command, ...rest] = argv;
	if (command !== "start" && command !== "end") {
		const help = command === "-h" || command === "--help";
		process[help ? "stdout" : "stderr"].write(USAGE);
		return help ? 0 : 2;
	}
	// The app runs a brainstorm only for the chief of staff, known by the pane.
	const fromPane = process.env["HERDR_PANE_ID"];
	if (!fromPane) {
		return fail(
			"HERDR_PANE_ID is not set, so Dunder would not know who asked. Nothing was sent. Run office-brainstorm from your bash tool in your office pane.",
			1,
		);
	}
	if (command === "end") {
		append({ v: 1, id: randomUUID(), fromPane, op: "end" });
		process.stdout.write("office-brainstorm: end requested; everyone heads back to their desk.\n");
		return 0;
	}
	const topic = rest.join(" ").trim();
	if (topic.length === 0) return fail(`what is the topic?\n${USAGE}`);
	if (topic.length > TOPIC_MAX) return fail(`the topic is longer than ${TOPIC_MAX} characters`);
	append({ v: 1, id: randomUUID(), fromPane, op: "start", topic });
	process.stdout.write(
		"office-brainstorm: start requested. Everyone walks to the whiteboard and gets the topic once free; end it with office-brainstorm end.\n",
	);
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = main(process.argv.slice(2));
}
