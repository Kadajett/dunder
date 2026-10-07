import { execFile } from "node:child_process";
import { createLogger } from "@shared/log/logger";
import type { MergeCheck, WorkCard } from "@shared/work-board";

const log = createLogger("work-board");

/** One git command's exit code and stdout (a non-zero exit is an answer, not a failure). */
export interface GitOutcome {
	readonly code: number;
	readonly stdout: string;
}
export type GitRun = (args: readonly string[]) => Promise<GitOutcome>;

const GIT_TIMEOUT_MS = 10_000;

/** `git <args>` in `cwd`; rejects only when git can't run or is killed. */
export function gitIn(cwd: string): GitRun {
	return (args) => {
		const { promise, resolve, reject } = Promise.withResolvers<GitOutcome>();
		const options = { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 };
		execFile("git", [...args], options, (error, stdout, stderr) => {
			if (error && typeof error.code !== "number") {
				reject(new Error(`git ${args.join(" ")} failed: ${stderr.trim() || error.message}`));
				return;
			}
			resolve({ code: error ? Number(error.code) : 0, stdout });
		});
		return promise;
	};
}

/** `git for-each-ref --format='%(refname:short) %(objectname)'` → branch → commit. */
export function parseHeads(stdout: string): ReadonlyMap<string, string> {
	const heads = new Map<string, string>();
	for (const line of stdout.split("\n")) {
		const [name, sha] = line.trim().split(" ");
		if (name && sha) heads.set(name, sha);
	}
	return heads;
}

/** `git merge-tree --write-tree --name-only --no-messages`: 0 clean, 1 conflicts (the tree, then the files). */
export function parseMergeTree({ code, stdout }: GitOutcome): MergeCheck {
	if (code === 0) return { state: "clean" };
	if (code !== 1) throw new Error(`git merge-tree exited ${code}`);
	const files = stdout
		.split("\n")
		.slice(1)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	return { state: "conflicts", files: [...new Set(files)] };
}

export const branchOf = (id: string): string => `bead/${id}`;

/**
 * Whether each Review card's `bead/<id>` branch merges cleanly into the
 * branch the main checkout is on. `git merge-tree` touches no checkout; it
 * runs once per pair of heads, so a poll with nothing moved costs two cheap
 * git reads.
 */
export class MergeChecks {
	readonly #git: GitRun;
	/** `<main sha>:<branch sha>` → the answer. Only the pairs on the board stay. */
	#cache = new Map<string, MergeCheck>();

	constructor(git: GitRun) {
		this.#git = git;
	}

	/** The cards with `merge` set on Review cards; unchanged when git can't answer. */
	async annotate(cards: readonly WorkCard[]): Promise<readonly WorkCard[]> {
		if (!cards.some((card) => card.lane === "review")) return cards;
		try {
			const main = await this.#git(["symbolic-ref", "--short", "HEAD"]);
			const refs = await this.#git([
				"for-each-ref",
				"--format=%(refname:short) %(objectname)",
				"refs/heads/",
			]);
			const heads = parseHeads(refs.stdout);
			const into = heads.get(main.stdout.trim());
			if (main.code !== 0 || refs.code !== 0 || !into) return cards;
			const cache = new Map<string, MergeCheck>();
			const checked: WorkCard[] = [];
			for (const card of cards) checked.push(await this.#check(card, into, heads, cache));
			this.#cache = cache;
			return checked;
		} catch (error) {
			log.warn("cannot check review branches", { error });
			return cards;
		}
	}

	async #check(
		card: WorkCard,
		into: string,
		heads: ReadonlyMap<string, string>,
		cache: Map<string, MergeCheck>,
	): Promise<WorkCard> {
		if (card.lane !== "review") return card;
		const head = heads.get(branchOf(card.id));
		if (!head) return { ...card, merge: { state: "no-branch" } };
		const key = `${into}:${head}`;
		const merge =
			this.#cache.get(key) ??
			parseMergeTree(
				await this.#git(["merge-tree", "--write-tree", "--name-only", "--no-messages", into, head]),
			);
		cache.set(key, merge);
		return { ...card, merge };
	}
}
