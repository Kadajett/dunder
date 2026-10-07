import { createLogger } from "@shared/log/logger";
import {
	GITHUB_LABEL,
	ghIssuesSchema,
	type IssueBead,
	type IssueStep,
	issueBeadsSchema,
	planIssueSync,
} from "./issues";

const log = createLogger("github-issues");

/** How often GitHub is read: issues reach the board within this. */
export const ISSUE_POLL_MS = 5 * 60_000;

export interface IssueSyncDeps {
	/** `owner/repo` the office takes issues from; null when the checkout isn't on GitHub. */
	readonly repo: () => Promise<string | null>;
	/** Read the repo's 'office' issues as `gh issue list --json` output. The sync's only GitHub call. */
	readonly listIssues: (repo: string) => Promise<string>;
	/** `bd <args>` in the office's repo. */
	readonly bd: (args: readonly string[]) => Promise<string>;
	/** Log the bd writes instead of running them. */
	readonly dryRun: boolean;
	/** Beads changed: refresh the work board now. */
	readonly changed: () => void;
	readonly setTimer: (callback: () => void, ms: number) => () => void;
}

/** One pass: what was (or, dry, would be) written to bd. */
export interface IssueSyncPass {
	readonly repo: string | null;
	readonly steps: readonly IssueStep[];
}

/**
 * Pulls GitHub issues labelled 'office' onto the work board as beads, every
 * `ISSUE_POLL_MS`. Pull-only: it reads GitHub and writes only bd. Nothing
 * goes back to GitHub; a closed bead whose issue is still open is logged
 * for the report-back Jeremy hasn't approved yet.
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
		if (!repo) return { repo, steps: [] };
		const issues = ghIssuesSchema.parse(JSON.parse(await this.#deps.listIssues(repo)));
		const beads = issueBeadsSchema.parse(
			JSON.parse(
				await this.#deps.bd(["list", "--json", "--all", `--label=${GITHUB_LABEL}`, "-n", "0"]),
			),
		);
		const steps = planIssueSync(issues, beads);
		this.#noteClosed(
			beads,
			new Set(
				issues.filter((issue) => issue.state.toUpperCase() === "OPEN").map((issue) => issue.url),
			),
		);
		if (this.#deps.dryRun) {
			for (const step of steps) log.info("dry run: would run bd", { args: step.args });
			return { repo, steps };
		}
		for (const step of steps) {
			await this.#deps.bd(step.args);
			log.info(step.kind === "create" ? "issue onto the board" : "issue changed", {
				url: step.url,
			});
		}
		if (steps.length > 0) this.#deps.changed();
		return { repo, steps };
	}

	/** Report-back is off in v1: say which issues it would close, once each. */
	#noteClosed(beads: readonly IssueBead[], open: ReadonlySet<string>): void {
		for (const bead of beads) {
			const url = bead.external_ref;
			if (bead.status !== "closed" || !url || !open.has(url) || this.#reported.has(bead.id))
				continue;
			this.#reported.add(bead.id);
			log.info("bead closed; its GitHub issue stays open (report-back is off)", {
				bead: bead.id,
				url,
			});
		}
	}

	async #tick(): Promise<void> {
		await this.pass().catch((error: unknown) => log.warn("GitHub issue sync failed", { error }));
		if (this.#started) this.#cancel = this.#deps.setTimer(() => void this.#tick(), ISSUE_POLL_MS);
	}
}
