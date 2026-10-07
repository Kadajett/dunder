import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promote, STAGING_DIR } from "./builds";

/** Upper bound on one production build. */
export const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const TAIL_LINES = 40;

export type BuildResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: string; readonly logTail: string };

/** The last `limit` lines of a stream of output chunks. */
export class LogTail {
	#lines: string[] = [""];
	readonly #limit: number;

	constructor(limit = TAIL_LINES) {
		this.#limit = limit;
	}

	push(chunk: string): void {
		const [first = "", ...rest] = chunk.replaceAll("\r", "").split("\n");
		this.#lines[this.#lines.length - 1] += first;
		this.#lines.push(...rest);
		const excess = this.#lines.length - this.#limit - 1;
		if (excess > 0) this.#lines.splice(0, excess);
	}

	text(): string {
		return this.#lines.join("\n").trim();
	}
}

/** Runs npm with these args in the checkout, streaming output into the log; resolves with the exit code (null when it did not finish). */
export type NpmRunner = (
	root: string,
	args: readonly string[],
	log: LogTail,
	onLog: () => void,
) => Promise<number | null>;

/** Spawn npm; a run longer than BUILD_TIMEOUT_MS is killed. */
export function runNpm(
	root: string,
	args: readonly string[],
	log: LogTail,
	onLog: () => void,
): Promise<number | null> {
	const done = Promise.withResolvers<number | null>();
	const child = spawn("npm", [...args], {
		cwd: root,
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
		stdio: ["ignore", "pipe", "pipe"],
		// Own process group, so a timeout kills npm and everything under it.
		detached: true,
	});
	const timer = setTimeout(() => {
		log.push(`\nnpm ${args[0] ?? ""} timed out after ${BUILD_TIMEOUT_MS / 60_000} minutes\n`);
		if (child.pid) process.kill(-child.pid, "SIGTERM");
	}, BUILD_TIMEOUT_MS);
	const append = (chunk: Buffer): void => {
		log.push(chunk.toString("utf8"));
		onLog();
	};
	child.stdout.on("data", append);
	child.stderr.on("data", append);
	child.on("error", (error) => {
		log.push(`\n${error.message}\n`);
		done.resolve(null);
	});
	child.on("close", (code) => done.resolve(code));
	return done.promise.finally(() => clearTimeout(timer));
}

export const INSTALL_ARGS = ["install", "--no-audit", "--no-fund"] as const;
const BUILD_ARGS = ["run", "build", "--", "--outDir", STAGING_DIR] as const;

function exitReason(code: number | null): string {
	return code === null ? "did not finish" : `exited with ${code}`;
}

export interface BuildOptions {
	/** Run `npm install` first: the dependencies changed since the running build. */
	readonly install: boolean;
	/** The running build's commit: its `out/` is kept aside for a rollback. */
	readonly outgoing: string | undefined;
	readonly run?: NpmRunner;
}

/**
 * Build the app checkout for production (installing dependencies first if
 * asked) into a staging dir, and install it as `out/` only when it succeeds,
 * so a broken build never leaves `out/` half-written for the next launch.
 */
export async function buildApp(
	root: string,
	onLog: (tail: string) => void,
	{ install, outgoing, run = runNpm }: BuildOptions,
): Promise<BuildResult> {
	const log = new LogTail();
	const emit = (): void => onLog(log.text());
	if (install) {
		log.push("Dependencies changed: npm install\n");
		emit();
		const code = await run(root, INSTALL_ARGS, log, emit);
		if (code !== 0) {
			return {
				ok: false,
				error: `npm install failed: it ${exitReason(code)}`,
				logTail: log.text(),
			};
		}
	}
	await rm(join(root, STAGING_DIR), { recursive: true, force: true });
	const code = await run(root, BUILD_ARGS, log, emit);
	if (code !== 0) return { ok: false, error: `the build ${exitReason(code)}`, logTail: log.text() };
	try {
		await promote(root, outgoing);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const failure = `could not install the new build: ${message}`;
		return { ok: false, error: failure, logTail: log.text() };
	}
	return { ok: true };
}
