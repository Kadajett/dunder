import type { UpdateCommit } from "@shared/app-update";

const BEAD_ID = String.raw`[a-z][a-z0-9]*-[a-z0-9]+(?:\.[0-9]+)*`;
/** `office-dk7.2: summary`: an engineer's commit on their bead branch. */
const BEAD_COMMIT = new RegExp(`^(${BEAD_ID}): `, "i");
/** `Merge bead/office-dk7.2 (…)`: Max merging a bead branch. */
const BEAD_MERGE = new RegExp(`^Merge bead/(${BEAD_ID})(?![\\w.-])`, "i");
/** Branch plumbing (`Merge branch 'master' into bead/…`): no change of its own to report. */
const PLUMBING_MERGE = /^Merge (?:remote-tracking )?branch /;
const TRY_IT = /^\s*try it:\s*(.*\S)\s*$/i;

export interface CommitBead {
	readonly id: string;
	readonly subject: string;
}

export interface CommitBeads {
	/** Each bead once, newest first. */
	readonly beads: readonly CommitBead[];
	/** Subjects of the commits that name no bead, newest first. */
	readonly others: readonly string[];
}

/**
 * Beads named by commit subjects (newest first), by the office's convention.
 * A bead appears once; its summary prefers the engineer's commit subject
 * over Max's merge line.
 */
export function beadsOfCommits(commits: readonly UpdateCommit[]): CommitBeads {
	const beads = new Map<string, CommitBead & { readonly merge: boolean }>();
	const others: string[] = [];
	for (const { subject } of commits) {
		const commit = BEAD_COMMIT.exec(subject)?.[1];
		const merge = BEAD_MERGE.exec(subject)?.[1];
		const id = (commit ?? merge)?.toLowerCase();
		if (id === undefined) {
			if (!PLUMBING_MERGE.test(subject)) others.push(subject);
			continue;
		}
		const seen = beads.get(id);
		if (!seen || (seen.merge && commit !== undefined))
			beads.set(id, { id, subject, merge: commit === undefined });
	}
	return { beads: [...beads.values()].map(({ id, subject }) => ({ id, subject })), others };
}

/** The last `Try it:` line of a bead's notes, without the prefix; null when there is none. */
export function tryItOf(notes: string | undefined): string | null {
	const lines = (notes ?? "").split("\n");
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const match = TRY_IT.exec(lines[index] ?? "");
		if (match?.[1]) return match[1];
	}
	return null;
}

export type CardPlan =
	/** Under the dev server, or this build was already seen. */
	| { readonly kind: "none" }
	/** No record yet: remember this build, show nothing. */
	| { readonly kind: "first-launch" }
	/** Everything merged since the last build Jeremy dismissed. */
	| { readonly kind: "since"; readonly from: string }
	/** The last seen build isn't in this build's history: list recent commits. */
	| { readonly kind: "recent" };

/**
 * Whether to show a card for the running build. `lastSeen` is undefined when
 * there is no record yet; `ancestor` says whether it is in the build's history.
 */
export function planCard(
	built: string | undefined,
	lastSeen: string | undefined,
	ancestor: boolean,
): CardPlan {
	if (built === undefined) return { kind: "none" };
	if (lastSeen === undefined) return { kind: "first-launch" };
	if (lastSeen === built) return { kind: "none" };
	return ancestor ? { kind: "since", from: lastSeen } : { kind: "recent" };
}
