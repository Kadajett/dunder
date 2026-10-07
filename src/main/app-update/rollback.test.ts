import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { promote, STAGING_DIR } from "./builds";
import { beadIdsIn, noteRollback, previousBuild } from "./rollback";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo() {
	const dir = mkdtempSync(join(tmpdir(), "rollback-git-"));
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
	return { dir, commit };
}

/** The checkout after an update from `good` to the running build: `out-prev/` holds `good`'s build. */
async function updatedFrom(dir: string, good: string): Promise<void> {
	mkdirSync(join(dir, "out"));
	mkdirSync(join(dir, STAGING_DIR));
	await promote(dir, good);
}

describe("beadIdsIn", () => {
	it("finds bead ids in bead commits and their merges, once each", () => {
		expect(
			beadIdsIn([
				"Merge bead/office-dkh",
				"office-dkh: done cards say what was delivered",
				"office-dk7.3: pool engine",
				"Merge branch 'bead/office-9fa'",
				"fix typo in README",
			]),
		).toEqual(["office-dkh", "office-dk7.3", "office-9fa"]);
	});
});

describe("previousBuild", () => {
	it("names the kept build, and says when the dependencies changed since", async () => {
		const { dir, commit } = repo();
		const good = commit("office-a1: good build");
		const running = commit("office-b2: panel", "panel.ts");
		await updatedFrom(dir, good);
		expect(await previousBuild(dir, running)).toEqual({
			commit: good,
			subject: "office-a1: good build",
			dependenciesChanged: false,
		});
		const withDeps = commit("office-c3: new dependency", "package-lock.json");
		expect((await previousBuild(dir, withDeps))?.dependenciesChanged).toBe(true);
		expect(await previousBuild(dir, good)).toBeNull();
	});
});

describe("noteRollback", () => {
	it("comments on each bead in the rolled-back range, and reports the ones bd refused", async () => {
		const { dir, commit } = repo();
		const good = commit("office-a1: good build");
		commit("office-b2: panel", "panel.ts");
		commit("chore: tidy", "tidy.ts");
		const bad = commit("Merge bead/office-c3", "merge.ts");
		const run = vi.fn(async (_root: string, args: readonly string[]) => {
			if (args[2] === "office-b2") throw new Error("bd is locked");
		});
		expect(await noteRollback(dir, { good, bad }, run)).toEqual(["office-b2"]);
		expect(run.mock.calls.map(([, args]) => args[2])).toEqual(["office-c3", "office-b2"]);
		expect(run.mock.calls[0]?.[1]).toEqual([
			"comments",
			"add",
			"office-c3",
			"--",
			expect.stringContaining(`from ${bad.slice(0, 7)} to ${good.slice(0, 7)}`),
		]);
	});
});
