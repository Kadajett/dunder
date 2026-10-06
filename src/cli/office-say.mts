// office-say: let an office agent talk to a colleague.
//   office-say <agent-name> <message…>
// Runs under plain Node (type stripping), so it uses only Node built-ins; the
// app validates every line against `mailLineSchema` (src/shared/switchboard.ts).
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** Where agents drop messages for the office to deliver. */
export function mailboxPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	const state = env["XDG_STATE_HOME"] || join(home, ".local", "state");
	return join(state, "dunder", "mailbox.ndjson");
}

const NAME = /^[a-z][a-z0-9_-]{0,31}$/;

function main(argv: readonly string[]): number {
	const [to, ...words] = argv;
	const text = words.join(" ").trim();
	if (!to || !NAME.test(to) || text.length === 0) {
		process.stderr.write('usage: office-say <agent-name> "<message>"\n');
		return 2;
	}
	if (text.length > 4_000) {
		process.stderr.write("office-say: message is longer than 4000 characters\n");
		return 2;
	}
	// The office knows the sender only by its pane. Without it the colleague sees
	// "someone" and has no way to reply, so refuse rather than send anonymously.
	const fromPane = process.env["HERDR_PANE_ID"];
	if (!fromPane) {
		process.stderr.write(
			`office-say: HERDR_PANE_ID is not set, so ${to} would not know who sent this or how to reply. Nothing was sent. Run office-say from your bash tool in your office pane (omp's eval tool does not pass HERDR_PANE_ID).\n`,
		);
		return 1;
	}
	const line = {
		v: 1,
		id: randomUUID(),
		fromPane,
		to,
		text,
		sentAt: new Date().toISOString(),
	};
	const path = mailboxPath(process.env, homedir());
	mkdirSync(dirname(path), { recursive: true });
	// One small O_APPEND write per message, so concurrent senders never interleave.
	appendFileSync(path, `${JSON.stringify(line)}\n`);
	process.stdout.write(`office-say: message for ${to} is in the mailroom\n`);
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = main(process.argv.slice(2));
}
