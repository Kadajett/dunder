import { basename } from "node:path";

/** One entry of `git worktree list --porcelain`. */
export interface ListedWorktree {
	readonly path: string;
	/** Short branch name, e.g. `bead/office-txi`; null when detached. */
	readonly branch: string | null;
}

/** Parse `git worktree list --porcelain` (blank-line separated records). */
export function parseWorktrees(stdout: string): ListedWorktree[] {
	return stdout.split(/\n\s*\n/).flatMap((record): ListedWorktree[] => {
		const lines = record.split("\n");
		const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
		if (!path) return [];
		const ref = lines.find((line) => line.startsWith("branch "))?.slice("branch ".length);
		return [{ path, branch: ref ? ref.replace(/^refs\/heads\//, "") : null }];
	});
}

/**
 * The agent's worktree: `<agent>-<bead>` for the first of `beads` it has,
 * else (unless `exact`) its most recently changed one (by `changedAt`). Null when it has none.
 */
export function pickWorktree(
	worktrees: readonly ListedWorktree[],
	{
		agent,
		beads,
		exact = false,
	}: {
		readonly agent: string;
		readonly beads: readonly string[];
		readonly exact?: boolean | undefined;
	},
	changedAt: (path: string) => number,
): ListedWorktree | null {
	const mine = worktrees.filter((tree) => basename(tree.path).startsWith(`${agent}-`));
	for (const bead of beads) {
		const match = mine.find((tree) => basename(tree.path) === `${agent}-${bead}`);
		if (match) return match;
	}
	if (exact) return null;
	return mine.toSorted((a, b) => changedAt(b.path) - changedAt(a.path))[0] ?? null;
}

/** `code -n` → ["code", ["-n"]]: the editor command split on spaces (no quoting). */
export function splitCommand(command: string): readonly [string, readonly string[]] | null {
	const [program, ...args] = command.trim().split(/\s+/).filter(Boolean);
	return program ? [program, args] : null;
}
