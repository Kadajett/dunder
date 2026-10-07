import { createLogger } from "@shared/log/logger";
import {
	type GhIssue,
	GITHUB_LABEL,
	ghIssuesSchema,
	type IssueBead,
	type IssueStep,
	issueBeadsSchema,
	planIssueSync,
} from "./issues";
import { planReportBack, type ReportBack } from "./report-back";

const log = createLogger("github-issues");

/** How often GitHub is read: issues reach the board within this. */
export const ISSUE_POLL_MS = 5 * 60_000;

export interface IssueSyncDeps {
	/** `owner/repo` the office takes issues from; null when the checkout isn't on GitHub. */
	readonly repo: () => Promise<string | null>;
	/** Read the repo's 'office' issues as `gh issue list --json` output. */
	readonly listIssues: (repo: string) => Promise<string>;
	/** `bd <args>` in the office's repo. */
	readonly bd: (args: readonly string[]) => Promise<string>;
	/** Log the bd writes and the GitHub closes instead of running them. */
	readonly dryRun: boolean;
	/** Beads changed: refresh the work board now. */
	readonly changed: () => void;
	readonly setTimer: (callback: () => void, ms: number) => () => void;
	/** Jeremy's setting (`github-issues.json`, off by default): close fixed issues on GitHub. */
	readonly reportBack: () => Promise<boolean>;
	/** The newest commit naming each bead (see `commitsByBead`). */
	readonly commits: () => Promise<ReadonlyMap<string, string>>;
	/** Close the issue with the comment (the sync's only GitHub write; fixed args). */
	readonly closeIssue: (repo: string, number: number, comment: string) => Promise<void>;
}

/** One pass: what was (or, dry, would be) written to bd, and the issues closed on GitHub. */
export interface IssueSyncPass {
	readonly repo: string | null;
	readonly steps: readonly IssueStep[];
	readonly closed: readonly ReportBack[];
}

/**
 * Pulls GitHub issues labelled 'office' onto the work board as beads, every
 * `ISSUE_POLL_MS`. It writes bd; the one thing that goes back to GitHub is
 * report-back, when Jeremy turns it on: a fixed issue is closed with its
 * commit and try-it line (nothing else from the bead). Off, those issues
 * are only logged.
 */
export class IssueSync {
	readonly #deps: IssueSyncDeps;
	readonly #reported = new Set<string>();
	#cancel: (() => void) | undefined;
	#started = false;

	constructor(deps: IssueSyncDeps) {
		this.#deps = deps;
	}

	start(): void {
		if (this.#started) return;
		this.#started = true;
		void this.#tick();
	}

	stop(): void {
		this.#started = false;
		this.#cancel?.();
		this.#cancel = undefined;
	}

	async pass(): Promise<IssueSyncPass> {
		const repo = await this.#deps.repo();
		if (!repo) return { repo, steps: [], closed: [] };
		const issues = ghIssuesSchema.parse(JSON.parse(await this.#deps.listIssues(repo)));
		const beads = issueBeadsSchema.parse(
			JSON.parse(
				await this.#deps.bd(["list", "--json", "--all", `--label=${GITHUB_LABEL}`, "-n", "0"]),
			),
		);
		const steps = planIssueSync(issues, beads);
		const closed = await this.#reportBack(repo, issues, beads);
		if (this.#deps.dryRun) {
			for (const step of steps) log.info("dry run: would run bd", { args: step.args });
			return { repo, steps, closed };
		}
		for (const step of steps) {
			await this.#deps.bd(step.args);
			log.info(step.kind === "create" ? "issue onto the board" : "issue changed", {
				url: step.url,
			});
		}
		if (steps.length > 0) this.#deps.changed();
		return { repo, steps, closed };
	}

	/** Close fixed issues on GitHub (report-back on), or say once each which ones it would (off). */
	async #reportBack(
		repo: string,
		issues: readonly GhIssue[],
		beads: readonly IssueBead[],
	): Promise<ReportBack[]> {
		const due = planReportBack(repo, issues, beads, await this.#deps.commits());
		if (!(await this.#deps.reportBack())) {
			for (const close of due.filter((each) => !this.#reported.has(each.bead))) {
				this.#reported.add(close.bead);
				log.info("bead fixed; its GitHub issue stays open (report-back is off)", { ...close });
			}
			return [];
		}
		const closed: ReportBack[] = [];
		for (const close of due) {
			if (this.#deps.dryRun) {
				log.info("dry run: would close the GitHub issue", { ...close });
				closed.push(close);
				continue;
			}
			// A failure is retried next pass; a closed issue never comes back here (it isn't open).
			await this.#deps.closeIssue(repo, close.number, close.text).then(
				() => closed.push(close),
				(error: unknown) => log.warn("cannot close the GitHub issue", { url: close.url, error }),
			);
		}
		return closed;
	}

	async #tick(): Promise<void> {
		await this.pass().catch((error: unknown) => log.warn("GitHub issue sync failed", { error }));
		if (this.#started) this.#cancel = this.#deps.setTimer(() => void this.#tick(), ISSUE_POLL_MS);
	}
}
