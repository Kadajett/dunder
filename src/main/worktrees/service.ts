import { createLogger } from "@shared/log/logger";
import type { AgentWorktree, OpenResult, WorktreeQuery } from "@shared/worktrees";
import { type ListedWorktree, parseWorktrees, pickWorktree, splitCommand } from "./list";

const log = createLogger("worktrees");

export interface WorktreeDeps {
	/** The app checkout, whose worktrees agents work in. */
	readonly root: string;
	readonly git: (cwd: string, args: readonly string[]) => Promise<string>;
	/** Last change time of a folder (epoch ms); 0 when it can't be read. */
	readonly changedAt: (path: string) => Promise<number>;
	/** The company's editor command, e.g. `code`. */
	readonly editorCommand: () => Promise<string>;
	/** Start `program args…` detached; resolves once it started, rejects with the spawn error. */
	readonly launch: (program: string, args: readonly string[]) => Promise<void>;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const codeOf = (error: unknown) =>
	typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

/** Agents' worktrees of the app repo, and opening one in Jeremy's editor. */
export class WorktreeService {
	readonly #deps: WorktreeDeps;

	constructor(deps: WorktreeDeps) {
		this.#deps = deps;
	}

	async find(query: Required<WorktreeQuery>): Promise<AgentWorktree | null> {
		const { root, git } = this.#deps;
		const worktrees = await this.#list();
		const times = new Map(
			await Promise.all(
				worktrees.map(async (tree) => [tree.path, await this.#deps.changedAt(tree.path)] as const),
			),
		);
		const tree = pickWorktree(worktrees, query, (path) => times.get(path) ?? 0);
		if (!tree) return null;
		const base = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
		const [ahead, status] = await Promise.all([
			git(tree.path, ["rev-list", "--count", `${base}..HEAD`]).catch(() => "0"),
			git(tree.path, ["status", "--porcelain", "--untracked-files=no"]).catch(() => ""),
		]);
		return {
			path: tree.path,
			branch: tree.branch,
			ahead: Number.parseInt(ahead.trim(), 10) || 0,
			base,
			dirty: status.trim().length > 0,
		};
	}

	/** Only a path git lists as one of the app's worktrees is opened; the renderer can't name others. */
	async open(path: string): Promise<OpenResult> {
		const known = (await this.#list()).some((tree) => tree.path === path);
		if (!known)
			return { ok: false, reason: "That folder isn't one of the app's worktrees any more" };
		const command = await this.#deps.editorCommand();
		const parsed = splitCommand(command);
		if (!parsed) return { ok: false, reason: "No editor command is set in company settings" };
		const [program, args] = parsed;
		try {
			await this.#deps.launch(program, [...args, path]);
			return { ok: true };
		} catch (error) {
			log.warn("editor failed to start", { program, error });
			if (codeOf(error) === "ENOENT")
				return {
					ok: false,
					reason: `Couldn't run "${program}": not found. Set the editor command in company settings.`,
				};
			return { ok: false, reason: `Couldn't run "${program}": ${reasonOf(error)}` };
		}
	}

	async #list(): Promise<ListedWorktree[]> {
		const { root, git } = this.#deps;
		return parseWorktrees(await git(root, ["worktree", "list", "--porcelain"]));
	}
}
