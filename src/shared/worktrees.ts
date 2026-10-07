import { z } from "zod";

/**
 * An agent's git worktree of the app repo. By the office convention it lives
 * at `<worktrees>/<agent>-<bead>` on branch `bead/<bead>`.
 */
export interface AgentWorktree {
	readonly path: string;
	/** e.g. `bead/office-txi`; null for a detached HEAD. */
	readonly branch: string | null;
	/** Commits on the branch that the main branch doesn't have. */
	readonly ahead: number;
	/** The main branch it is counted against, e.g. `master`. */
	readonly base: string;
	/** Uncommitted changes in the worktree. */
	readonly dirty: boolean;
}

export const worktreeQuerySchema = z.object({
	agent: z.string().min(1).max(64),
	/** Beads to look for first, most relevant first (the card's bead, or the agent's in-progress ones). */
	beads: z.array(z.string().max(80)).max(20),
	/** Only the worktree of one of `beads` (a work card), never the agent's latest. */
	exact: z.boolean().default(false),
});
export type WorktreeQuery = z.input<typeof worktreeQuerySchema>;

export type OpenResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** `window.office.worktrees`: agents' worktrees, opened in Jeremy's editor. */
export interface WorktreesApi {
	/** The agent's worktree for the first of `beads` it has, else (unless `exact`) its most recently changed one; null without any. */
	find(query: WorktreeQuery): Promise<AgentWorktree | null>;
	/** Open a worktree (only paths git lists as the app's worktrees) with the company's editor command. */
	open(path: string): Promise<OpenResult>;
}
