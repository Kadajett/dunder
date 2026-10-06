import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { z } from "zod";
import {
	type CliResult,
	herdrBinary,
	herdrChildEnv,
	OFFICE_SESSION,
	officeArgs,
	runHerdr,
} from "./cli";

const sessionListSchema = z.object({
	sessions: z.array(
		z.object({
			name: z.string(),
			default: z.boolean(),
			running: z.boolean(),
			socket_path: z.string(),
		}),
	),
});
type SessionEntry = z.infer<typeof sessionListSchema>["sessions"][number];

export interface SessionDeps {
	run(args: readonly string[]): Promise<CliResult>;
	/** Start `herdr --session office server` detached from this app's lifetime. */
	startServer(): void;
	sleep(ms: number): Promise<void>;
}

export async function findOfficeSession(
	deps: Pick<SessionDeps, "run">,
): Promise<SessionEntry | undefined> {
	const { stdout } = await deps.run(["session", "list", "--json"]);
	const office = sessionListSchema
		.parse(JSON.parse(stdout))
		.sessions.find((s) => s.name === OFFICE_SESSION);
	if (office?.default) throw new Error("refusing to use the default herdr session as the office");
	return office;
}

/**
 * Returns the office server's socket path, starting the server if needed.
 * The server outlives the app so agents keep working after it quits.
 */
export async function ensureOfficeServer(deps: SessionDeps, timeoutMs = 10_000): Promise<string> {
	const existing = await findOfficeSession(deps);
	if (existing?.running) return existing.socket_path;
	deps.startServer();
	const pollMs = 200;
	for (let waited = 0; waited < timeoutMs; waited += pollMs) {
		await deps.sleep(pollMs);
		const office = await findOfficeSession(deps);
		if (office?.running) return office.socket_path;
	}
	throw new Error(`herdr office session did not start within ${timeoutMs}ms`);
}

export function defaultSessionDeps(logPath: string): SessionDeps {
	return {
		run: (args) => runHerdr(args),
		startServer: () => {
			const log = openSync(logPath, "a");
			const child = spawn(herdrBinary(process.env), officeArgs(["server"]), {
				detached: true,
				stdio: ["ignore", log, log],
				env: herdrChildEnv(process.env),
			});
			child.unref();
		},
		sleep: (ms) => {
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, ms);
			return promise;
		},
	};
}
