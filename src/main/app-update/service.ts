import { readFile, writeFile } from "node:fs/promises";
import { UPDATE_COUNTDOWN_MS, type UpdateStatus } from "@shared/app-update";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import type { BuildResult } from "./build";
import { freshRequests } from "./requests";
import {
	afterCheck,
	afterFailure,
	canApply,
	type UpdateCheck,
	withCountdown,
	withoutCountdown,
} from "./status";

/** How often the app looks for new commits in its checkout. */
export const CHECK_INTERVAL_MS = 30_000;
/** Build output reaches the HUD at most this often. */
const LOG_EMIT_MS = 500;
const stateSchema = z.object({ offset: z.number().int().nonnegative() });
const log = createLogger("app-update");

export interface AppUpdaterDeps {
	/** The commit the running build was made from; undefined under the dev server. */
	readonly built: string | undefined;
	/** Where `office-update` appends requests, and where the read offset is kept. */
	readonly requestsPath: string;
	readonly statePath: string;
	emit(status: UpdateStatus): void;
	check(): Promise<UpdateCheck>;
	build(onLog: (tail: string) => void): Promise<BuildResult>;
	/** Quit and start again on the freshly built code. */
	relaunch(): void;
	now?(): number;
}

/**
 * Stable mode's updater: notices commits newer than the running build, and
 * rebuilds + relaunches only when Jeremy (HUD) or an agent (`office-update`,
 * after a countdown Jeremy can cancel) asks for it.
 */
export class AppUpdater {
	readonly #deps: AppUpdaterDeps;
	#status: UpdateStatus;
	#snapshot: SessionSnapshot | undefined;
	#checking: Promise<void> | undefined;
	#poll: NodeJS.Timeout | undefined;
	#countdown: NodeJS.Timeout | undefined;
	#tail: MailboxTail | undefined;

	constructor(deps: AppUpdaterDeps) {
		this.#deps = deps;
		this.#status = deps.built ? { state: "idle", head: deps.built } : { state: "dev" };
	}

	status(): UpdateStatus {
		return this.#status;
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#snapshot = snapshot;
	}

	async start(): Promise<void> {
		if (this.#status.state === "dev") return;
		this.#poll = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
		void this.check();
		const { requestsPath, statePath } = this.#deps;
		const offset = await readFile(statePath, "utf8").then(
			(text) => stateSchema.safeParse(JSON.parse(text)).data?.offset ?? 0,
			() => 0,
		);
		this.#tail = await tailMailbox({
			path: requestsPath,
			offset,
			onLines: (lines, next) => {
				// Persist first: the request that triggers a relaunch must not replay after it.
				void writeFile(statePath, JSON.stringify({ offset: next }));
				void this.receive(lines);
			},
			// A broken requests file only costs agent-triggered updates; the HUD button still works.
			onError: (error) => log.warn("cannot read update requests", { error }),
		});
	}

	stop(): void {
		clearInterval(this.#poll);
		clearTimeout(this.#countdown);
		this.#tail?.stop();
	}

	/** Look at the checkout now; concurrent callers share one check. */
	check(): Promise<void> {
		this.#checking ??= this.#deps
			.check()
			.then(
				(check) => this.#set(afterCheck(this.#status, this.#deps.built ?? "", check)),
				// git briefly unavailable (e.g. mid-rebase lock): keep the last status, try next tick.
				(error: unknown) => log.warn("update check failed", { error }),
			)
			.finally(() => {
				this.#checking = undefined;
			});
		return this.#checking;
	}

	/** New lines from the requests file: the newest fresh request starts a countdown. */
	async receive(lines: readonly string[]): Promise<void> {
		const request = freshRequests(lines, this.#now()).at(-1);
		if (!request || this.#status.state === "dev") return;
		// The agent usually asks right after merging: look before deciding there is nothing new.
		await this.check();
		const by =
			this.#snapshot?.agents.find((agent) => agent.pane_id === request.fromPane)?.name ?? "someone";
		const countdown = { by, reason: request.reason, applyAt: this.#now() + UPDATE_COUNTDOWN_MS };
		const next = withCountdown(this.#status, countdown);
		if (next === this.#status) return;
		clearTimeout(this.#countdown);
		this.#set(next);
		const reason = request.reason ? `${by}: ${request.reason}` : `requested by ${by}`;
		this.#countdown = setTimeout(() => void this.apply(reason), UPDATE_COUNTDOWN_MS);
	}

	cancel(): void {
		clearTimeout(this.#countdown);
		this.#countdown = undefined;
		this.#set(withoutCountdown(this.#status));
	}

	/** Rebuild on HEAD and relaunch; a failed build keeps the old one running. */
	async apply(reason?: string): Promise<void> {
		const target = this.#status;
		// Never while a build runs (or under the dev server, or when there is nothing new).
		if (!canApply(target)) return;
		clearTimeout(this.#countdown);
		this.#countdown = undefined;
		log.info("building", { head: target.head, reason });
		this.#set({ state: "building", logTail: reason ? `Updating: ${reason}` : "" });
		let emittedAt = 0;
		const result = await this.#deps
			.build((logTail) => {
				if (this.#now() - emittedAt < LOG_EMIT_MS) return;
				emittedAt = this.#now();
				this.#set({ state: "building", logTail });
			})
			.catch((error: unknown): BuildResult => ({ ok: false, error: String(error), logTail: "" }));
		if (!result.ok) {
			log.warn("build failed; the old build keeps running", { error: result.error });
			this.#set(afterFailure(target, result));
			return;
		}
		this.#set({ state: "building", logTail: "Built. Relaunching on the new build…" });
		this.#deps.relaunch();
	}

	#now(): number {
		return this.#deps.now?.() ?? Date.now();
	}

	#set(next: UpdateStatus): void {
		if (next === this.#status) return;
		this.#status = next;
		this.#deps.emit(next);
	}
}
