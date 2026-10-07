import type { AgentWorktree } from "@shared/worktrees";
import { useEffect, useState } from "react";
import "./open-in-editor.css";

const api = () => ("worktrees" in window.office ? window.office.worktrees : null);

/** The agent's worktree (looked up when shown): undefined while asking, null when it has none. */
function useWorktree(
	agent: string,
	beads: readonly string[],
	exact: boolean,
): AgentWorktree | null | undefined {
	const [tree, setTree] = useState<AgentWorktree | null | undefined>(undefined);
	const key = beads.join(",");
	useEffect(() => {
		const worktrees = api();
		if (!worktrees) {
			setTree(null);
			return;
		}
		let live = true;
		void worktrees
			.find({ agent, beads: key ? key.split(",") : [], exact })
			.then((found) => live && setTree(found))
			.catch(() => live && setTree(null));
		return () => {
			live = false;
		};
	}, [agent, key, exact]);
	return tree;
}

/** `bead/office-txi · 3 ahead of master · uncommitted changes` */
export function worktreeSummary(tree: AgentWorktree): string {
	const ahead = `${tree.ahead} ${tree.ahead === 1 ? "commit" : "commits"} ahead of ${tree.base}`;
	return [
		tree.branch ?? "detached HEAD",
		ahead,
		...(tree.dirty ? ["uncommitted changes"] : []),
	].join(" · ");
}

/**
 * Open the agent's worktree in Jeremy's editor (the company's editor
 * command): the one for `beads` if it has one, else its latest.
 */
export function OpenInEditor({
	agent,
	beads,
	exact = false,
}: {
	readonly agent: string;
	readonly beads: readonly string[];
	/** Only that bead's worktree (a work card), not the agent's latest. */
	readonly exact?: boolean;
}) {
	const tree = useWorktree(agent, beads, exact);
	const [error, setError] = useState<string | null>(null);
	const open = async () => {
		const worktrees = api();
		if (!worktrees || !tree) return;
		setError(null);
		const result = await worktrees
			.open(tree.path)
			.catch((cause: unknown) => ({ ok: false as const, reason: String(cause) }));
		if (!result.ok) setError(result.reason);
	};
	const title = tree
		? tree.path
		: tree === null
			? `No worktree for ${agent}${exact ? ` on ${beads[0] ?? "this bead"}` : ""} (no git worktree named ${agent}-<bead>)`
			: "Looking for the worktree…";
	return (
		<div className="open-editor">
			<button
				type="button"
				className="open-editor__button"
				disabled={!tree}
				title={title}
				onClick={() => void open()}
			>
				Open in editor
			</button>
			{tree ? <span className="open-editor__branch">{worktreeSummary(tree)}</span> : null}
			{error ? (
				<p className="open-editor__error" role="alert">
					{error}
				</p>
			) : null}
		</div>
	);
}
