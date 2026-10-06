/**
 * IO shared by the release command-line scripts. They run under plain Node type stripping, which
 * cannot resolve the app's extensionless imports, so output goes straight to stdout/stderr here
 * instead of through `src/shared/log`.
 */
import { execFile } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseManifest } from "./manifest.mts";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");
export const INSTALLER_DIR = join(REPO_ROOT, "packages/installer");

const COMMAND_TIMEOUT_MS = 60_000;

const inActions = process.env["GITHUB_ACTIONS"] === "true";

export function report(message: string): void {
	process.stdout.write(`${message}\n`);
}

/** A workflow-run annotation on GitHub Actions, a plain line elsewhere. */
export function notice(message: string): void {
	report(inActions ? `::notice::${message}` : message);
}

/** Step outputs for later workflow steps (`$GITHUB_OUTPUT`), or `key=value` lines locally. */
export function setOutputs(outputs: Record<string, string>): void {
	const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`);
	const file = process.env["GITHUB_OUTPUT"];
	if (file === undefined || file === "") process.stdout.write(lines.join(""));
	else appendFileSync(file, lines.join(""));
}

export function readRootVersion(): string {
	const path = join(REPO_ROOT, "package.json");
	return parseManifest(readFileSync(path, "utf8"), path).version;
}

/** Runs a command without a shell and resolves its stdout; rejects on failure or timeout. */
export function run(command: string, args: readonly string[]): Promise<string> {
	const { promise, resolve: done, reject } = Promise.withResolvers<string>();
	execFile(
		command,
		args,
		{ cwd: REPO_ROOT, timeout: COMMAND_TIMEOUT_MS, encoding: "utf8" },
		(error, stdout, stderr) => {
			if (error === null) return done(stdout);
			const detail = stderr.trim() || error.message;
			reject(new Error(`${command} ${args.join(" ")} failed: ${detail}`));
		},
	);
	return promise;
}

/** Runs a script's entry point, turning a thrown error into a failed exit with its message. */
export function runMain(main: () => Promise<void> | void): void {
	Promise.resolve()
		.then(main)
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(inActions ? `::error::${message}\n` : `error: ${message}\n`);
			process.exitCode = 1;
		});
}
