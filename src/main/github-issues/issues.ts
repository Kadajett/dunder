import { z } from "zod";

/** Only issues carrying this label reach the office: Jeremy (or a maintainer) decides what it takes. */
export const OFFICE_LABEL = "office";
/** Every bead made from an issue carries this label. */
export const GITHUB_LABEL = "github";
/** Issues read per repo per pass; far above what one repo's 'office' label holds. */
export const ISSUES_PER_REPO = 100;
/** Bead descriptions keep this much of an issue body. */
const BODY_MAX = 4_000;

/** `gh issue list --json number,title,body,url,state,author,labels`. */
export const ghIssuesSchema = z.array(
	z.object({
		number: z.number().int(),
		title: z.string(),
		body: z.string().nullish(),
		url: z.string().url(),
		state: z.string(),
		author: z.object({ login: z.string() }).nullish(),
		labels: z.array(z.object({ name: z.string() })).nullish(),
	}),
);
export type GhIssue = z.infer<typeof ghIssuesSchema>[number];

/** `bd list --json` rows made from issues (the fields the sync reads). */
export const issueBeadsSchema = z.array(
	z.object({
		id: z.string(),
		title: z.string(),
		description: z.string().nullish(),
		status: z.string(),
		external_ref: z.string().nullish(),
	}),
);
export type IssueBead = z.infer<typeof issueBeadsSchema>[number];

export const issueTitle = (issue: GhIssue): string => `${issue.title} (#${issue.number})`;

/**
 * The bead's description: the issue body (capped), then where it came from
 * with the issue's title, so an unchanged description means an unchanged
 * issue (and the office's own edits to the bead's title stand).
 */
export function issueDescription(issue: GhIssue): string {
	const body = (issue.body ?? "").trim();
	const capped = body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}…` : body;
	const by = issue.author ? ` by @${issue.author.login}` : "";
	return `${capped || "(no description)"}\n\n---\nFrom GitHub${by}: ${issue.url} "${issue.title}"`;
}

const isBug = (issue: GhIssue): boolean =>
	(issue.labels ?? []).some((label) => label.name.toLowerCase() === "bug");

/** bd writes for one pass: one bead per issue (by its URL), refreshed while open when the issue changes. */
export type IssueStep =
	| { readonly kind: "create"; readonly args: readonly string[]; readonly url: string }
	| { readonly kind: "update"; readonly args: readonly string[]; readonly url: string };

function createStep(issue: GhIssue): IssueStep {
	const args = [
		"create",
		`--title=${issueTitle(issue)}`,
		`--description=${issueDescription(issue)}`,
		`--type=${isBug(issue) ? "bug" : "task"}`,
		"--priority=2",
		`--labels=${GITHUB_LABEL}`,
		`--external-ref=${issue.url}`,
	];
	return { kind: "create", args, url: issue.url };
}

function updateStep(issue: GhIssue, bead: IssueBead): IssueStep | null {
	if (bead.status === "closed") return null;
	const description = issueDescription(issue);
	if ((bead.description ?? "") === description) return null;
	const args = ["update", bead.id, `--title=${issueTitle(issue)}`, `--description=${description}`];
	return { kind: "update", args, url: issue.url };
}

/**
 * What to write so every open 'office' issue has its bead. An issue closed
 * on GitHub before it got one is left out; a bead already made stays the
 * office's (closing or editing it never goes back to GitHub).
 */
export function planIssueSync(
	issues: readonly GhIssue[],
	beads: readonly IssueBead[],
): IssueStep[] {
	const byRef = new Map(
		beads.flatMap((bead) => (bead.external_ref ? [[bead.external_ref, bead] as const] : [])),
	);
	return issues.flatMap((issue) => {
		const bead = byRef.get(issue.url);
		if (bead) return updateStep(issue, bead) ?? [];
		return issue.state.toUpperCase() === "OPEN" ? [createStep(issue)] : [];
	});
}

/** `owner/repo` from a GitHub remote URL (https or ssh); null for anything else. */
export function githubRepoOf(remote: string): string | null {
	const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
	return match ? `${match[1]}/${match[2]}` : null;
}
