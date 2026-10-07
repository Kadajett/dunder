import type { UpdateCommit } from "@shared/app-update";
import { beadOfSubject } from "@shared/change-notes.mts";

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
		const named = beadOfSubject(subject);
		if (!named) {
			if (!PLUMBING_MERGE.test(subject)) others.push(subject);
			continue;
		}
		const seen = beads.get(named.id);
		if (!seen || (seen.merge && !named.merge)) beads.set(named.id, { ...named, subject });
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
 * How the running build relates to the last one Jeremy saw: `ahead` (the last
 * seen is in this build's history: an update), `behind` (this build is in the
 * last seen one's history: he went back, e.g. a rollback), or `apart`
 * (neither: history was rewritten).
 */
export type BuildHistory = "ahead" | "behind" | "apart";

/**
 * Whether to show a card for the running build. `lastSeen` is undefined when
 * there is no record yet. Going back shows nothing: those commits aren't new.
 */
export function planCard(
	built: string | undefined,
	lastSeen: string | undefined,
	history: BuildHistory,
): CardPlan {
	if (built === undefined) return { kind: "none" };
	if (lastSeen === undefined) return { kind: "first-launch" };
	if (lastSeen === built || history === "behind") return { kind: "none" };
	return history === "ahead" ? { kind: "since", from: lastSeen } : { kind: "recent" };
}
