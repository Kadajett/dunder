import { spawn } from "node:child_process";
import {
	chmod,
	lstat,
	mkdir,
	open,
	rename,
	rm,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { delimiter, dirname } from "node:path";
import { download, resolveLatest } from "./net.js";
import type { Action, Plan } from "./plan.js";
import type { Asker } from "./prompt.js";
import { isAppImageHeader, type Release } from "./release.js";
import { describeAction } from "./report.js";

/** A real AppImage is tens of megabytes; anything this small is an error page. */
const MIN_APPIMAGE_BYTES = 1_000_000;

export interface ExecuteContext {
	readonly asker: Asker;
	readonly home: string;
	/** PATH for child processes: setup's bin dirs first, so fresh installs are found. */
	readonly path: string;
	readonly out: (text: string) => void;
}

function runCommand(action: Extract<Action, { kind: "run" }>, path: string): Promise<void> {
	const { promise, resolve, reject } = Promise.withResolvers<void>();
	const child = spawn(action.command, [...action.args], {
		cwd: action.cwd,
		env: { ...process.env, PATH: path },
		stdio: "inherit",
		timeout: action.timeoutMs,
	});
	child.once("error", reject);
	child.once("exit", (code, signal) => {
		if (code === 0) resolve();
		else reject(new Error(`${action.command} exited with ${signal ?? `code ${code}`}`));
	});
	return promise;
}

async function readHeader(path: string): Promise<Uint8Array> {
	const file = await open(path, "r");
	try {
		const header = new Uint8Array(16);
		await file.read(header, 0, header.length, 0);
		return header;
	} finally {
		await file.close();
	}
}

async function installApp(
	action: Extract<Action, { kind: "install-app" }>,
	out: (text: string) => void,
): Promise<void> {
	const release: Release | undefined = action.release ?? (await resolveLatest());
	if (!release)
		throw new Error("could not find the latest Dunder release (site and GitHub both failed)");
	await mkdir(dirname(action.path), { recursive: true });
	const partial = `${action.path}.download`;
	let shown = -1;
	const got = await download(release.url, partial, (bytes, total) => {
		const mb = Math.floor(bytes / 10_000_000);
		if (mb === shown) return;
		shown = mb;
		out(`  ${(bytes / 1e6).toFixed(0)} MB${total ? ` of ${(total / 1e6).toFixed(0)} MB` : ""}\n`);
	});
	try {
		if (got.bytes < MIN_APPIMAGE_BYTES || !isAppImageHeader(await readHeader(partial))) {
			throw new Error(`${release.url} did not return an AppImage`);
		}
		if (release.sha256 !== undefined && release.sha256 !== got.sha256) {
			throw new Error(`checksum mismatch: expected ${release.sha256}, got ${got.sha256}`);
		}
	} catch (error) {
		await rm(partial, { force: true });
		throw error;
	}
	await chmod(partial, 0o755);
	await rename(partial, action.path);
	const record = { version: release.version, sha256: got.sha256, source: release.source };
	await writeFile(
		action.record,
		`${JSON.stringify({ ...record, installedAt: new Date().toISOString() }, null, "\t")}\n`,
	);
	out(`  Dunder ${release.version} installed (sha256 ${got.sha256})\n`);
}

async function writeAtomically(path: string, content: string, mode: number): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, content, { mode });
	await chmod(temp, mode);
	await rename(temp, path);
}

/** Replaces an existing symlink; never clobbers a real file someone put there. */
async function link(target: string, path: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const existing = await lstat(path).catch(() => undefined);
	if (existing && !existing.isSymbolicLink())
		throw new Error(`${path} exists and is not a symlink`);
	if (existing) await unlink(path);
	await symlink(target, path);
}

function perform(action: Action, context: ExecuteContext): Promise<void> {
	switch (action.kind) {
		case "run":
			return runCommand(action, context.path);
		case "install-app":
			return installApp(action, context.out);
		case "write":
			return writeAtomically(action.path, action.content, action.mode);
		case "link":
			return link(action.target, action.path);
	}
}

/** Runs the plan in order, asking where a step needs consent. Stops at the first failure. */
export async function execute(plan: Plan, context: ExecuteContext): Promise<boolean> {
	const { out, asker, home } = context;
	for (const [index, step] of plan.steps.entries()) {
		if (step.consent && !(await asker.confirm(step.consent, true))) {
			out(`- skipped: ${step.title}\n`);
			continue;
		}
		out(
			`\n[${index + 1}/${plan.steps.length}] ${step.title}\n  ${describeAction(step.action, home)}\n`,
		);
		try {
			await perform(step.action, context);
		} catch (error) {
			out(`✗ ${step.title} failed: ${error instanceof Error ? error.message : String(error)}\n`);
			out("Fix the problem and run setup again; finished steps are not repeated.\n");
			return false;
		}
	}
	return true;
}

/** Setup's bin dirs ahead of the user's PATH. */
export function childPath(dirs: readonly (string | undefined)[], userPath: string): string {
	return [...dirs.filter((dir): dir is string => Boolean(dir)), userPath].join(delimiter);
}
