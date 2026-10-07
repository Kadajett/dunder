import { execFile } from "node:child_process";
import type { PreviousBuild } from "@shared/app-update";
import { keptBuild } from "./builds";
import { commitLog, dependenciesChanged } from "./git";

/** Upper bound on one `bd comments add`. */
const BD_TIMEOUT_MS = 10_000;

/**
 * The kept previous build Jeremy can roll back to, named by its commit; null
 * when none is kept, or it is the running build itself.
 */
export async function previousBuild(root: string, running: string): Promise<PreviousBuild | null> {
	const kept = await keptBuild(root);
	if (!kept || kept.commit === running) return null;
	const [commit] = await commitLog(root, ["-n", "1", kept.commit]).catch(() => []);
	return {
		commit: kept.commit,
		subject: commit?.subject ?? "",
		dependenciesChanged: await dependenciesChanged(root, kept.commit, running),
	};
}

const COMMIT_BEAD = /^([a-z][a-z0-9]*-[a-z0-9]+(?:\.[0-9]+)*):/;
const MERGE_BEAD = /^Merge (?:branch ')?bead\/([a-z][a-z0-9]*-[a-z0-9]+(?:\.[0-9]+)*)/;

/** Bead ids named by commit subjects ('office-abc: …', 'Merge bead/office-abc'), each once, in order. */
export function beadIdsIn(subjects: readonly string[]): string[] {
	const ids = subjects.flatMap((subject) => {
		const id = COMMIT_BEAD.exec(subject)?.[1] ?? MERGE_BEAD.exec(subject)?.[1];
		return id ? [id] : [];
	});
	return [...new Set(ids)];
}

export type BdRunner = (root: string, args: readonly string[]) => Promise<void>;

function runBd(root: string, args: readonly string[]): Promise<void> {
	const done = Promise.withResolvers<void>();
	execFile("bd", [...args], { cwd: root, timeout: BD_TIMEOUT_MS }, (error, _stdout, stderr) => {
		if (error)
			done.reject(
				new Error(`bd ${args.slice(0, 2).join(" ")} failed: ${stderr.trim() || error.message}`),
			);
		else done.resolve();
	});
	return done.promise;
}

export interface RollbackRange {
	readonly good: string;
	readonly bad: string;
	/** Jeremy's one line from the confirm, if he wrote one. */
	readonly whatBroke?: string;
}

/** What Max and the beads in the range are told: who rolled back what, why if Jeremy said, and the range. */
export function rollbackText(range: RollbackRange, beads: readonly string[]): string {
	const bad = range.bad.slice(0, 7);
	const good = range.good.slice(0, 7);
	const why = range.whatBroke ? `: ${range.whatBroke}` : " (he didn't say what broke)";
	const named = beads.length > 0 ? ` (${beads.join(", ")})` : "";
	return `Jeremy rolled back ${bad} → ${good}${why}. Range: ${good}..${bad}${named}. Agents' updates stay off until he updates; check whether your change is the cause.`;
}

/**
 * Tell the engineers: every bead named in `good..bad` gets `rollbackText` as a
 * comment. Resolves with the text and the beads bd refused.
 */
export async function noteRollback(
	root: string,
	range: RollbackRange,
	run: BdRunner = runBd,
): Promise<{ readonly text: string; readonly failed: string[] }> {
	const commits = await commitLog(root, [`${range.good}..${range.bad}`]);
	const ids = beadIdsIn(commits.map((commit) => commit.subject));
	const text = rollbackText(range, ids);
	const results = await Promise.allSettled(
		ids.map((id) => run(root, ["comments", "add", id, "--", text])),
	);
	return { text, failed: ids.filter((_, index) => results[index]?.status === "rejected") };
}
