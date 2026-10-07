import { beadOfSubject } from "@shared/change-notes.mts";
import { tryItOf } from "../whats-new/card";
import type { GhIssue, IssueBead } from "./issues";

/** One issue to close on GitHub, and the only text that goes with it. */
export interface ReportBack {
	readonly bead: string;
	readonly number: number;
	readonly url: string;
	readonly text: string;
}

/**
 * The newest commit naming each bead (`<id>: …` or `Merge bead/<id>`), from
 * `git log --format=%H%x1f%s` (newest first).
 */
export function commitsByBead(log: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const line of log.split("\n")) {
		const [sha, subject] = line.split("\x1f");
		const id = subject ? beadOfSubject(subject)?.id : undefined;
		if (sha && id && !found.has(id)) found.set(id, sha);
	}
	return found;
}

/**
 * The public comment: the fixing commit and the bead's try-it line, nothing
 * else (the repo is public; titles, descriptions and notes are the office's).
 */
export function reportBackText(repo: string, sha: string, tryIt: string | null): string {
	const fixed = `Fixed in ${sha.slice(0, 7)} (https://github.com/${repo}/commit/${sha}).`;
	return tryIt ? `${fixed}\n\nTry it: ${tryIt}` : fixed;
}

/**
 * Issues to close: each closed bead made from an 'office' issue that is still
 * open on GitHub, once a commit names the bead (one closed without a commit,
 * e.g. won't fix, isn't reported as fixed).
 */
export function planReportBack(
	repo: string,
	issues: readonly GhIssue[],
	beads: readonly IssueBead[],
	commits: ReadonlyMap<string, string>,
): ReportBack[] {
	const open = new Map(
		issues
			.filter((issue) => issue.state.toUpperCase() === "OPEN")
			.map((issue) => [issue.url, issue.number] as const),
	);
	return beads.flatMap((bead) => {
		const number = bead.external_ref ? open.get(bead.external_ref) : undefined;
		const sha = commits.get(bead.id);
		if (bead.status !== "closed" || number === undefined || !bead.external_ref || !sha) return [];
		const text = reportBackText(repo, sha, tryItOf(bead.notes ?? undefined));
		return [{ bead: bead.id, number, url: bead.external_ref, text }];
	});
}
