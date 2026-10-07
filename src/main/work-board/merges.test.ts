import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkCard } from "@shared/work-board";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type GitRun, gitIn, MergeChecks } from "./merges";

let repo: string;
const git = (...args: string[]) =>
	execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
		cwd: repo,
		stdio: "pipe",
	}).toString();
const commit = async (file: string, text: string) => {
	await writeFile(join(repo, file), text);
	git("add", file);
	git("commit", "-qm", file);
};
const card = (id: string, lane: WorkCard["lane"] = "review") => ({ id, lane }) as WorkCard;

beforeEach(async () => {
	repo = await mkdtemp(join(tmpdir(), "merges-"));
	git("init", "-q", "-b", "master");
	await commit("a.ts", "one\n");
	git("checkout", "-qb", "bead/x-clean");
	await commit("b.ts", "new file\n");
	git("checkout", "-q", "master");
	git("checkout", "-qb", "bead/x-clash");
	await commit("a.ts", "theirs\n");
	git("checkout", "-q", "master");
	await commit("a.ts", "ours\n");
});
afterEach(() => rm(repo, { recursive: true, force: true }));

/** The real git, counting merge-tree runs. */
function counted(): { run: GitRun; merges: () => number } {
	const real = gitIn(repo);
	let merges = 0;
	return {
		run: (args) => {
			if (args[0] === "merge-tree") merges += 1;
			return real(args);
		},
		merges: () => merges,
	};
}

describe("MergeChecks", () => {
	it("marks each Review card clean, conflicting (which files) or without a branch; other lanes untouched", async () => {
		const checks = new MergeChecks(gitIn(repo));
		const cards = await checks.annotate([
			card("x-clean"),
			card("x-clash"),
			card("x-none"),
			card("x-clash", "in_progress"),
		]);
		expect(cards.map((each) => each.merge)).toEqual([
			{ state: "clean" },
			{ state: "conflicts", files: ["a.ts"] },
			{ state: "no-branch" },
			undefined,
		]);
	});

	it("runs merge-tree again only when the branch or the main branch moves", async () => {
		const { run, merges } = counted();
		const checks = new MergeChecks(run);
		await checks.annotate([card("x-clean"), card("x-clash")]);
		await checks.annotate([card("x-clean"), card("x-clash")]);
		expect(merges()).toBe(2);
		git("checkout", "-q", "bead/x-clash");
		git("merge", "-q", "master", "-X", "ours", "-m", "take master");
		git("checkout", "-q", "master");
		const [, clash] = await checks.annotate([card("x-clean"), card("x-clash")]);
		expect(merges()).toBe(3);
		expect(clash?.merge).toEqual({ state: "clean" });
		await commit("c.ts", "more\n");
		await checks.annotate([card("x-clean"), card("x-clash")]);
		expect(merges()).toBe(5);
	});

	it("leaves the board as it is when git can't answer", async () => {
		const checks = new MergeChecks(gitIn(join(repo, "missing")));
		const cards = [card("x-clean")];
		expect(await checks.annotate(cards)).toBe(cards);
	});
});
