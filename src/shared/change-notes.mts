/**
 * How a merged bead reads as a change, shared by the What's new card (main)
 * and `office-notes` (a plain-Node CLI). No imports: Node runs this file
 * directly with type stripping, so only erasable TypeScript here.
 */

const BEAD_ID = String.raw`[a-z][a-z0-9]*-[a-z0-9]+(?:\.[0-9]+)*`;
/** `office-dk7.2: summary`: an engineer's commit on their bead branch. */
const BEAD_COMMIT = new RegExp(`^(${BEAD_ID}): `, "i");
/** `Merge bead/office-dk7.2 (…)`: Max merging a bead branch. */
const BEAD_MERGE = new RegExp(`^Merge bead/(${BEAD_ID})(?![\\w.-])`, "i");

/** The bead a commit subject names, by the office's convention, and whether it is Max's merge line. */
export function beadOfSubject(
	subject: string,
): { readonly id: string; readonly merge: boolean } | null {
	const commit = BEAD_COMMIT.exec(subject)?.[1];
	if (commit) return { id: commit.toLowerCase(), merge: false };
	const merge = BEAD_MERGE.exec(subject)?.[1];
	return merge ? { id: merge.toLowerCase(), merge: true } : null;
}

/** A bead title as a person reads it: without 'idea: ', 'epic: ' or 'HUD audit #6: ' in front. */
export function displayTitle(title: string): string {
	return title
		.replace(/^\s*(?:idea|epic):\s*/i, "")
		.replace(/^[\w ]*audit #\d+:\s*/i, "")
		.trim();
}

/** Paths that never change what someone using Dunder sees: tooling, agent docs, tests, CI, Beads. */
const INTERNAL_PATH = [
	/^scripts\//,
	/^docs\/agents\//,
	/^\.github\//,
	/^\.beads\//,
	/(?:^|\/)__tests__\//,
	/\.(?:test|spec)\.[cm]?[jt]sx?$/,
];

export const isInternalPath = (path: string): boolean =>
	INTERNAL_PATH.some((pattern) => pattern.test(path));

/** A bead whose commits touch only internal paths ('Under the hood'); not when no paths are known. */
export const isInternalOnly = (paths: readonly string[]): boolean =>
	paths.length > 0 && paths.every(isInternalPath);

/** Separates commits in `git log --format=<COMMIT_MARK>%s --name-only`. */
export const COMMIT_MARK = "\x1e";

/**
 * Files changed per bead from `git log --format=%x1e%s --name-only <range>`:
 * each bead's own commits (merge commits list no files).
 */
export function pathsByBead(log: string): Map<string, string[]> {
	const paths = new Map<string, string[]>();
	for (const chunk of log.split(COMMIT_MARK)) {
		const [subject = "", ...files] = chunk.split("\n");
		const bead = beadOfSubject(subject);
		if (!bead) continue;
		const known = paths.get(bead.id) ?? [];
		for (const file of files)
			if (file.trim() && !known.includes(file.trim())) known.push(file.trim());
		paths.set(bead.id, known);
	}
	return paths;
}
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Remove exact bead ids; their prefix alone can match command names like `office-notes`. */
export function stripBeadIds(text: string, ids: readonly string[]): string {
	const alternatives = ids
		.map(escapeRegExp)
		.sort((left, right) => right.length - left.length)
		.join("|");
	if (!alternatives) return text;
	return text.replace(new RegExp(String.raw`\(?\b(?:${alternatives})\b(?![\w.-])\)?`, "gi"), "");
}
