import { execFile } from "node:child_process";
import { runGit } from "../app-update/git";
import { runBd } from "../beads/bd";
import { githubRepoOf, ISSUES_PER_REPO, OFFICE_LABEL } from "./issues";
import { IssueSync } from "./service";

const GH_TIMEOUT_MS = 30_000;
const ISSUE_FIELDS = "number,title,body,url,state,author,labels";

/**
 * The repo's issues labelled 'office' (open and closed), through Jeremy's
 * `gh` login. The sync's one GitHub command, and a read: the args are fixed
 * here, nothing else reaches gh.
 */
export function listOfficeIssues(repo: string): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	const args = [
		"issue",
		"list",
		`--repo=${repo}`,
		`--label=${OFFICE_LABEL}`,
		"--state=all",
		`--limit=${ISSUES_PER_REPO}`,
		`--json=${ISSUE_FIELDS}`,
	];
	execFile(
		"gh",
		args,
		{ timeout: GH_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
		(error, stdout, stderr) => {
			if (error)
				reject(
					new Error(`gh issue list failed: ${stderr.trim() || error.message}`, { cause: error }),
				);
			else resolve(stdout);
		},
	);
	return promise;
}

/** The app checkout's GitHub repo, from its `origin` remote. */
async function originRepo(cwd: string): Promise<string | null> {
	return githubRepoOf(await runGit(cwd, ["remote", "get-url", "origin"]));
}

/** Issues from the app checkout's GitHub repo onto its Beads (`cwd`); `changed` refreshes the board. */
export function createIssueSync(cwd: string, changed: () => void): IssueSync {
	return new IssueSync({
		repo: () => originRepo(cwd),
		listIssues: listOfficeIssues,
		bd: (args) => runBd(args, cwd),
		dryRun: process.env["DUNDER_ISSUES_DRY_RUN"] === "1",
		changed,
		setTimer: (callback, ms) => {
			const timer = setTimeout(callback, ms);
			return () => clearTimeout(timer);
		},
	});
}
