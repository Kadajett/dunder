import { execFile } from "node:child_process";
import type { UpdateCommit } from "@shared/app-update";
import type { UpdateCheck } from "./status";

/** Upper bound on one git command; the checkout is local, so this is generous. */
const GIT_TIMEOUT_MS = 5_000;
const FIELD = "\x1f";

/** Run `git <args>` in `root`; resolves with stdout, rejects with git's stderr. */
export function runGit(root: string, args: readonly string[]): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	const options = { cwd: root, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 };
	execFile("git", [...args], options, (error, stdout, stderr) => {
		if (error) {
			reject(new Error(`git ${args.join(" ")} failed: ${stderr.trim() || error.message}`));
			return;
		}
		resolve(stdout);
	});
	return promise;
}

/** Parse `git log --format=%H%x1f%s` output, newest first. */
export function parseCommitLog(stdout: string): UpdateCommit[] {
	const commits: UpdateCommit[] = [];
	for (const line of stdout.split("\n")) {
		const at = line.indexOf(FIELD);
		if (at === -1) continue;
		const sha = line.slice(0, at).trim();
		if (!/^[0-9a-f]{7,64}$/.test(sha)) continue;
		commits.push({ sha, subject: line.slice(at + 1).trim() });
	}
	return commits;
}

/**
 * HEAD of the app checkout and the commits it is ahead of the running build.
 * An unknown `built` commit (history rewritten) still reports HEAD, with no range.
 */
export async function checkCheckout(root: string, built: string): Promise<UpdateCheck> {
	const head = (await runGit(root, ["rev-parse", "HEAD"])).trim();
	if (head === built) return { head, commits: [] };
	const log = await runGit(root, ["log", "--format=%H%x1f%s", `${built}..${head}`]).catch(() => "");
	return { head, commits: parseCommitLog(log) };
}

/** Commits `git log` lists for `args` (a range, or `-n N <rev>`), newest first. */
export async function commitLog(root: string, args: readonly string[]): Promise<UpdateCommit[]> {
	return parseCommitLog(await runGit(root, ["log", "--format=%H%x1f%s", ...args]));
}

/** Whether `from` is in `to`'s history; false also when git doesn't know `from` (history rewritten). */
export function isAncestor(root: string, from: string, to: string): Promise<boolean> {
	return runGit(root, ["merge-base", "--is-ancestor", from, to]).then(
		() => true,
		() => false,
	);
}

/**
 * Whether package.json / package-lock.json differ between the running build
 * and `head`. Unknown `built` (dev build, rewritten history) counts as changed:
 * an extra `npm install` is harmless, a missing one breaks the build.
 */
export async function dependenciesChanged(
	root: string,
	built: string | undefined,
	head: string,
): Promise<boolean> {
	if (!built) return true;
	const files = ["package.json", "package-lock.json"];
	return runGit(root, ["diff", "--name-only", built, head, "--", ...files]).then(
		(stdout) => stdout.trim() !== "",
		() => true,
	);
}
