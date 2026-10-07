import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { runGit } from "../app-update/git";
import { runBd } from "../beads/bd";
import { githubRepoOf, ISSUES_PER_REPO, OFFICE_LABEL } from "./issues";
import { commitsByBead } from "./report-back";
import { IssueSync } from "./service";

const log = createLogger("github-issues");
const GH_TIMEOUT_MS = 30_000;
const ISSUE_FIELDS = "number,title,body,url,state,author,labels";
/** Commits searched for the one naming a closed bead: far beyond the issues still open. */
const COMMITS_SEARCHED = 2_000;

/** `gh <args>` through Jeremy's login: the args are fixed by the callers here, nothing else reaches gh. */
function gh(args: readonly string[]): Promise<string> {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	execFile(
		"gh",
		[...args],
		{ timeout: GH_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
		(error, stdout, stderr) => {
			if (error)
				reject(
					new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${stderr.trim() || error.message}`, {
						cause: error,
					}),
				);
			else resolve(stdout);
		},
	);
	return promise;
}

/** The repo's issues labelled 'office' (open and closed). A read. */
export function listOfficeIssues(repo: string): Promise<string> {
	return gh([
		"issue",
		"list",
		`--repo=${repo}`,
		`--label=${OFFICE_LABEL}`,
		"--state=all",
		`--limit=${ISSUES_PER_REPO}`,
		`--json=${ISSUE_FIELDS}`,
	]);
}

/** Close a fixed issue with its public comment: report-back's one GitHub write. */
async function closeIssue(repo: string, number: number, comment: string): Promise<void> {
	await gh(["issue", "close", String(number), `--repo=${repo}`, `--comment=${comment}`]);
}

/** `<userData>/github-issues.json`: whether fixed issues are closed on GitHub. Off until Jeremy turns it on. */
const settingsSchema = z.object({ reportBack: z.boolean().default(false) });

/** The setting, read each pass (so turning it on needs no restart); the file is written with its default once. */
function reportBackSetting(path: string): () => Promise<boolean> {
	let written = false;
	return async () => {
		const text = await readFile(path, "utf8").catch(() => "{}");
		let json: unknown = {};
		try {
			json = JSON.parse(text);
		} catch {
			log.warn("github-issues.json is not JSON; report-back stays off", { path });
		}
		const settings = settingsSchema.safeParse(json).data ?? settingsSchema.parse({});
		if (!written) {
			written = true;
			await writeFile(path, `${JSON.stringify(settings, null, "\t")}\n`).catch(() => undefined);
		}
		return settings.reportBack;
	};
}

/** The app checkout's GitHub repo, from its `origin` remote. */
async function originRepo(cwd: string): Promise<string | null> {
	return githubRepoOf(await runGit(cwd, ["remote", "get-url", "origin"]));
}

/** Issues from the app checkout's GitHub repo onto its Beads (`cwd`); `changed` refreshes the board. */
export function createIssueSync(cwd: string, userData: string, changed: () => void): IssueSync {
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
		reportBack: reportBackSetting(join(userData, "github-issues.json")),
		commits: async () =>
			commitsByBead(
				await runGit(cwd, ["log", "--format=%H%x1f%s", `-n${COMMITS_SEARCHED}`, "HEAD"]),
			),
		closeIssue,
	});
}
