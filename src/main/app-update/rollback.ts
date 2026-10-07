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

/**
 * Tell the engineers: every bead named in `good..bad` gets a comment that
 * Jeremy rolled the app back past it. Resolves with the beads that failed.
 */
export async function noteRollback(
	root: string,
	range: { readonly good: string; readonly bad: string },
	run: BdRunner = runBd,
): Promise<string[]> {
	const commits = await commitLog(root, [`${range.good}..${range.bad}`]);
	const text = `Jeremy rolled the app back from ${range.bad.slice(0, 7)} to ${range.good.slice(0, 7)}: something in that range broke it. Check whether this change is the cause.`;
	const ids = beadIdsIn(commits.map((commit) => commit.subject));
	const results = await Promise.allSettled(
		ids.map((id) => run(root, ["comments", "add", id, "--", text])),
	);
	return ids.filter((_, index) => results[index]?.status === "rejected");
}
