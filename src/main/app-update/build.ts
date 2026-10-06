import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";

/** Upper bound on one production build. */
export const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * The build goes here first and replaces `out/` only when it succeeds, so a
 * broken build never leaves `out/` half-written for the next launch.
 */
const STAGING_DIR = "out-next";
const PREVIOUS_DIR = "out-prev";
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

/** Swap the staged build into `out/`, putting the old one back if the swap fails. */
async function promote(root: string): Promise<void> {
	const out = join(root, "out");
	const previous = join(root, PREVIOUS_DIR);
	await rm(previous, { recursive: true, force: true });
	await rename(out, previous).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== "ENOENT") throw error;
	});
	try {
		await rename(join(root, STAGING_DIR), out);
	} catch (error) {
		await rename(previous, out).catch(() => undefined);
		throw error;
	}
	await rm(previous, { recursive: true, force: true });
}

/** Run `npm run build` into the staging dir; resolves with the exit code (null when killed). */
function runNpmBuild(root: string, log: LogTail, onLog: () => void): Promise<number | null> {
	const done = Promise.withResolvers<number | null>();
	const child = spawn("npm", ["run", "build", "--", "--outDir", STAGING_DIR], {
		cwd: root,
		env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
		stdio: ["ignore", "pipe", "pipe"],
		// Own process group, so a timeout kills npm and the vite build under it.
		detached: true,
	});
	const timer = setTimeout(() => {
		log.push(`\nbuild timed out after ${BUILD_TIMEOUT_MS / 60_000} minutes\n`);
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

/** Build the app checkout for production and install it as `out/`. */
export async function buildApp(root: string, onLog: (tail: string) => void): Promise<BuildResult> {
	const log = new LogTail();
	await rm(join(root, STAGING_DIR), { recursive: true, force: true });
	const code = await runNpmBuild(root, log, () => onLog(log.text()));
	if (code !== 0) {
		const error = code === null ? "the build did not finish" : `the build exited with ${code}`;
		return { ok: false, error, logTail: log.text() };
	}
	try {
		await promote(root);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const failure = `could not install the new build: ${message}`;
		return { ok: false, error: failure, logTail: log.text() };
	}
	return { ok: true };
}
