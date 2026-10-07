import { readFile, writeFile } from "node:fs/promises";
import type { UpdateCountdown, UpdateStatus } from "@shared/app-update";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import type { BuildResult } from "./build";
import { freshRequests } from "./requests";
import {
	afterCheck,
	afterFailure,
	afterWait,
	busyChanged,
	canApply,
	nextDeadline,
	requestUpdate,
	type UpdateCheck,
	withoutCountdown,
} from "./status";

/** How a countdown's update is described in the build log. */
function applyReason({ by, reason, extra }: UpdateCountdown): string {
	const who = extra > 0 ? `${by} + ${extra} more` : by;
	return reason ? `${who}: ${reason}` : `requested by ${who}`;
}

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
	/** Requests read before the first snapshot: the requester's name comes from it. */
	#early: string[] = [];
	#checking: Promise<void> | undefined;
	#poll: NodeJS.Timeout | undefined;
	/** Fires at the next deadline: a countdown's apply, or a held update's start. */
	#timer: NodeJS.Timeout | undefined;
	/** What Jeremy is doing (from the renderer); agents' updates wait while it is set. */
	#busy: string | null = null;
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
		if (this.#early.length === 0) return;
		const early = this.#early;
		this.#early = [];
		log.info("handling update requests read before the first snapshot", { lines: early.length });
		void this.receive(early);
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
		clearTimeout(this.#timer);
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

	/** New lines from the requests file: the newest fresh request counts down, or waits while Jeremy is busy. */
	async receive(lines: readonly string[]): Promise<void> {
		if (!this.#snapshot) {
			this.#early.push(...lines);
			return;
		}
		const request = freshRequests(lines, this.#now()).at(-1);
		if (!request || this.#status.state === "dev") return;
		// The agent usually asks right after merging: look before deciding there is nothing new.
		await this.check();
		const by =
			this.#snapshot?.agents.find((agent) => agent.pane_id === request.fromPane)?.name ?? "someone";
		this.#set(requestUpdate(this.#status, { by, reason: request.reason }, this.#busy, this.#now()));
	}

	/** Jeremy is busy (why) or free (null); a countdown pauses while he is busy. */
	setBusy(busy: string | null): void {
		this.#busy = busy;
		this.#set(busyChanged(this.#status, busy, this.#now()));
	}

	cancel(): void {
		this.#set(withoutCountdown(this.#status));
	}

	/** Rebuild on HEAD and relaunch; a failed build keeps the old one running. */
	async apply(reason?: string): Promise<void> {
		const target = this.#status;
		// Never while a build runs (or under the dev server, or when there is nothing new).
		if (!canApply(target)) return;
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
		this.#schedule();
	}

	/** One timer for whatever is due next; every status change re-plans it. */
	#schedule(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		const deadline = nextDeadline(this.#status);
		if (deadline === null) return;
		this.#timer = setTimeout(() => this.#due(), Math.max(0, deadline - this.#now()));
	}

	/** A deadline passed: apply a finished countdown, or start a held update's countdown. */
	#due(): void {
		const status = this.#status;
		const now = this.#now();
		if (canApply(status) && status.countdown && status.countdown.applyAt <= now) {
			void this.apply(applyReason(status.countdown));
			return;
		}
		const next = afterWait(status, now);
		if (next === status) this.#schedule();
		else this.#set(next);
	}
}
