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

/** The office message to an engineer whose Review branch stopped merging cleanly. */
export function conflictMessage(id: string, into: string, files: readonly string[]): string {
	const named = files.length > 0 ? files.join(", ") : "(git named no files)";
	return `Dunder's merge check: your ${id} (branch ${branchOf(id)}) no longer merges cleanly into ${into}: conflicts in ${named}. Rebase it onto ${into}, run npm run check, and report the new commit as usual.`;
}

/** Tell an agent something as an office message. */
export type Notify = (agent: string, text: string) => void;

/**
 * Whether each Review card's `bead/<id>` branch merges cleanly into the
 * branch the main checkout is on. `git merge-tree` touches no checkout; it
 * runs once per pair of heads, so a poll with nothing moved costs two cheap
 * git reads.
 */
export class MergeChecks {
	readonly #git: GitRun;
	readonly #notify: Notify | undefined;
	/** `<main sha>:<branch sha>` → the answer. Only the pairs on the board stay. */
	#cache = new Map<string, MergeCheck>();
	/** Review bead → the conflicting branch head its engineer was told about (or that was there at launch). */
	#told = new Map<string, string>();
	/** The first check after launch only learns which conflicts are already known. */
	#seeded = false;

	constructor(git: GitRun, notify?: Notify) {
		this.#git = git;
		this.#notify = notify;
	}

	/** The cards with `merge` set on Review cards; unchanged when git can't answer. */
	async annotate(cards: readonly WorkCard[]): Promise<readonly WorkCard[]> {
		if (!cards.some((card) => card.lane === "review")) {
			// Nothing in review: from here on, a conflict is news.
			this.#told = new Map();
			this.#seeded = true;
			return cards;
		}
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
			this.#tellConflicts(checked, heads, main.stdout.trim());
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

	/** One message per conflicting branch head, to the bead's assignee; none for conflicts already there at launch. */
	#tellConflicts(
		cards: readonly WorkCard[],
		heads: ReadonlyMap<string, string>,
		into: string,
	): void {
		const told = new Map<string, string>();
		for (const card of cards) {
			const head = heads.get(branchOf(card.id));
			if (card.lane !== "review" || card.merge?.state !== "conflicts" || !head) continue;
			told.set(card.id, head);
			if (!this.#seeded || this.#told.get(card.id) === head || !card.assignee) continue;
			log.info("review branch conflicts; telling its engineer", {
				bead: card.id,
				agent: card.assignee,
			});
			this.#notify?.(card.assignee, conflictMessage(card.id, into, card.merge.files));
		}
		this.#told = told;
		this.#seeded = true;
	}
}
