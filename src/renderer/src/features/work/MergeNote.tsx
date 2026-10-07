import type { MergeCheck } from "@shared/work-board";

/** Conflicting files shown by name before '+N more'. */
const FILES_SHOWN = 2;

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);

export function mergeText(merge: MergeCheck, id: string): string {
	switch (merge.state) {
		case "clean":
			return "merges cleanly";
		case "no-branch":
			return `no branch bead/${id}`;
		case "conflicts": {
			const named = merge.files.slice(0, FILES_SHOWN).map(baseName).join(", ");
			const more = merge.files.length - FILES_SHOWN;
			return `conflicts: ${named}${more > 0 ? ` +${more} more` : ""}`;
		}
	}
}

/** A Review card's merge check: whether `bead/<id>` merges cleanly into main, before Max tries. */
export function MergeNote({ merge, id }: { readonly merge: MergeCheck; readonly id: string }) {
	const title =
		merge.state === "conflicts"
			? `bead/${id} conflicts with the main branch in:\n${merge.files.join("\n")}`
			: `Checked with git merge-tree against the main checkout's branch; rechecked when either moves.`;
	return (
		<p className="work-card__merge" data-merge={merge.state} title={title}>
			{mergeText(merge, id)}
		</p>
	);
}
