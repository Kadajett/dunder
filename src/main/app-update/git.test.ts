import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCheckout, dependenciesChanged, parseCommitLog } from "./git";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo() {
	const dir = mkdtempSync(join(tmpdir(), "app-update-git-"));
	dirs.push(dir);
	const config = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];
	const git = (...args: string[]) =>
		execFileSync("git", [...config, ...args], { cwd: dir, encoding: "utf8" }).trim();
	git("init", "-q");
	const commit = (subject: string, file = "file.txt") => {
		writeFileSync(join(dir, file), subject);
		git("add", file);
		git("commit", "-q", "-m", subject);
		return git("rev-parse", "HEAD");
	};
	return { dir, git, commit };
}

describe("parseCommitLog", () => {
	it("splits sha and subject, keeping separators inside the subject", () => {
		const sha = "0123456789abcdef0123456789abcdef01234567";
		expect(parseCommitLog(`${sha}\x1ffix: a\x1fb\n\n`)).toEqual([{ sha, subject: "fix: a\x1fb" }]);
	});

	it("skips lines that are not commits", () => {
		expect(parseCommitLog("warning: something\nnot-a-sha\x1fsubject\n")).toEqual([]);
	});
});

describe("checkCheckout", () => {
	it("lists the commits HEAD is ahead of the running build, newest first", async () => {
		const { dir, commit } = repo();
		const built = commit("one");
		commit("two");
		const head = commit("three");
		expect(await checkCheckout(dir, built)).toEqual({
			head,
			commits: [
				{ sha: head, subject: "three" },
				{ sha: expect.any(String), subject: "two" },
			],
		});
		expect(await checkCheckout(dir, head)).toEqual({ head, commits: [] });
	});

	it("reports HEAD with no range when the built commit is unknown", async () => {
		const { dir, commit } = repo();
		const head = commit("one");
		expect(await checkCheckout(dir, "f".repeat(40))).toEqual({ head, commits: [] });
	});
});

describe("dependenciesChanged", () => {
	it("is true only when package.json or package-lock.json changed since the build", async () => {
		const { dir, commit } = repo();
		const built = commit("one");
		const unchanged = commit("two");
		expect(await dependenciesChanged(dir, built, unchanged)).toBe(false);
		const lock = commit("{}", "package-lock.json");
		expect(await dependenciesChanged(dir, unchanged, lock)).toBe(true);
		const manifest = commit("{}", "package.json");
		expect(await dependenciesChanged(dir, lock, manifest)).toBe(true);
	});

	it("is true when the built commit is unknown", async () => {
		const { dir, commit } = repo();
		const head = commit("one");
		expect(await dependenciesChanged(dir, undefined, head)).toBe(true);
		expect(await dependenciesChanged(dir, "f".repeat(40), head)).toBe(true);
	});
});
