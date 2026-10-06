import { execFile } from "node:child_process";

/** The only herdr session this app may touch. */
export const OFFICE_SESSION = "office";

/**
 * Environment for herdr child processes. Inherited `HERDR_*` pane context
 * (socket path, pane/tab/workspace IDs) would otherwise point commands at the
 * session that launched this app, which is never the office session.
 * `HERDR_CONFIG_PATH` is user configuration, not pane context, so it stays.
 */
export function herdrChildEnv(env: Readonly<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
	return Object.fromEntries(
		Object.entries(env).filter(([key]) => !key.startsWith("HERDR_") || key === "HERDR_CONFIG_PATH"),
	);
}

export function herdrBinary(env: Readonly<NodeJS.ProcessEnv>): string {
	return env["HERDR_OFFICE_BIN"] ?? env["HERDR_BIN_PATH"] ?? "herdr";
}

/** Prefix every CLI call with the office session selector. */
export function officeArgs(args: readonly string[]): string[] {
	return ["--session", OFFICE_SESSION, ...args];
}

export interface CliResult {
	readonly stdout: string;
	readonly stderr: string;
}

/** Run a short-lived `herdr` command with the sanitized environment. */
export function runHerdr(args: readonly string[], timeoutMs = 15_000): Promise<CliResult> {
	const { promise, resolve, reject } = Promise.withResolvers<CliResult>();
	const options = {
		env: herdrChildEnv(process.env),
		timeout: timeoutMs,
		maxBuffer: 16 * 1024 * 1024,
	};
	execFile(herdrBinary(process.env), [...args], options, (error, stdout, stderr) => {
		if (error) {
			const detail = stderr.trim() || error.message;
			reject(new Error(`herdr ${args.join(" ")} failed: ${detail}`, { cause: error }));
			return;
		}
		resolve({ stdout, stderr });
	});
	return promise;
}
