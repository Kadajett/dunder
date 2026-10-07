import { readFile, writeFile } from "node:fs/promises";
import type {
	PreviousBuild,
	RollbackResult,
	UpdateCountdown,
	UpdateStatus,
} from "@shared/app-update";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { type MailboxTail, tailMailbox } from "../switchboard/mailbox";
import { batchUntil, loadBatchMs } from "./batching";
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
const stateSchema = z.object({
	offset: z.number().int().nonnegative(),
	/** The build Jeremy rolled back from: not offered by agents until HEAD moves past it. */
	rolledBackFrom: z.string().optional(),
	/** When an update (or rollback) last applied: agents' updates batch for the interval after it. */
	lastAppliedAt: z.number().optional(),
});
type UpdaterState = z.infer<typeof stateSchema>;
const log = createLogger("app-update");

export interface AppUpdaterDeps {
	/** The commit the running build was made from; undefined under the dev server. */
	readonly built: string | undefined;
	/** Where `office-update` appends requests, and where the read offset is kept. */
	readonly requestsPath: string;
	readonly statePath: string;
	/** `update-batching.json`: the batch interval (default 2 h; 0 turns batching off). */
	readonly settingsPath: string;
	emit(status: UpdateStatus): void;
	check(): Promise<UpdateCheck>;
	build(onLog: (tail: string) => void): Promise<BuildResult>;
	/** Quit and start again on the freshly built code. */
	relaunch(): void;
	/** The kept previous build, if there is one to roll back to. */
	previous(): Promise<PreviousBuild | null>;
	/** Swap the kept build back into `out/` (and tell the beads in between). */
	restore(previous: PreviousBuild): Promise<void>;
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
	#state: UpdaterState = { offset: 0 };
	/** State writes in order: an offset write must never interleave with the rollback's. */
	#saving: Promise<void> = Promise.resolve();
	/** Agents' updates apply at most this often (ms); 0: no batching. */
	#batchMs = 0;

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
		const { requestsPath, statePath } = this.#deps;
		// Before the first check: it needs to know a build Jeremy rolled back from.
		this.#state = await readFile(statePath, "utf8").then(
			(text) => stateSchema.safeParse(JSON.parse(text)).data ?? { offset: 0 },
			() => ({ offset: 0 }),
		);
		this.#batchMs = await loadBatchMs(this.#deps.settingsPath);
		this.#poll = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
		void this.check();
		this.#tail = await tailMailbox({
			path: requestsPath,
			offset: this.#state.offset,
			onLines: (lines, next) => {
				// Persist first: the request that triggers a relaunch must not replay after it.
				void this.#saveState({ ...this.#state, offset: next });
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
				(check) => {
					const pinned = this.#state.rolledBackFrom;
					this.#set(afterCheck(this.#status, this.#deps.built ?? "", check, pinned));
					// A newer commit landed (or he updated anyway): agents may update again.
					if (pinned && check.head !== pinned) {
						const { rolledBackFrom: _left, ...state } = this.#state;
						void this.#saveState(state);
					}
				},
				// git briefly unavailable (e.g. mid-rebase lock): keep the last status, try next tick.
				(error: unknown) => log.warn("update check failed", { error }),
			)
			.finally(() => {
				this.#checking = undefined;
			});
		return this.#checking;
	}

	/**
	 * New lines from the requests file: the newest fresh request waits for the
	 * batch window, or counts down (held while Jeremy is busy). A hotfix among
	 * them skips the window.
	 */
	async receive(lines: readonly string[]): Promise<void> {
		if (!this.#snapshot) {
			this.#early.push(...lines);
			return;
		}
		const fresh = freshRequests(lines, this.#now());
		const request = fresh.at(-1);
		if (!request || this.#status.state === "dev") return;
		// The agent usually asks right after merging: look before deciding there is nothing new.
		await this.check();
		const by =
			this.#snapshot?.agents.find((agent) => agent.pane_id === request.fromPane)?.name ?? "someone";
		// A hotfix among them skips the window (the hold while busy and the countdown still apply).
		const until = fresh.some((line) => line.hotfix)
			? null
			: batchUntil(this.#state.lastAppliedAt, this.#batchMs);
		const named = { by, reason: request.reason, ...(until === null ? {} : { batchUntil: until }) };
		const next = requestUpdate(this.#status, named, this.#busy, this.#now());
		this.#set(next);
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
		// The window restarts with every update, whoever asked for it.
		await this.#saveState({ ...this.#state, lastAppliedAt: this.#now() });
		this.#deps.relaunch();
	}

	/** The build Jeremy can roll back to (none while building or under the dev server). */
	previous(): Promise<PreviousBuild | null> {
		if (this.#status.state === "dev" || this.#status.state === "building")
			return Promise.resolve(null);
		return this.#deps.previous();
	}

	/**
	 * Swap the kept previous build back in and relaunch on it. The build left
	 * behind is remembered, so agents can't update straight back onto it.
	 */
	async rollback(): Promise<RollbackResult> {
		const bad = this.#deps.built;
		const before = this.#status;
		const previous = await this.previous();
		if (!bad || !previous) return { ok: false, error: "there is no previous build to go back to" };
		if (previous.dependenciesChanged) {
			return {
				ok: false,
				error: "the dependencies changed since that build, so it can't run here",
			};
		}
		log.info("rolling back", { from: bad, to: previous.commit });
		this.#set({ state: "building", logTail: `Rolling back to ${previous.commit.slice(0, 7)}…` });
		try {
			await this.#deps.restore(previous);
		} catch (error) {
			log.warn("rollback failed; the current build keeps running", { error });
			this.#set(before);
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
		await this.#saveState({ ...this.#state, rolledBackFrom: bad, lastAppliedAt: this.#now() });
		this.#deps.relaunch();
		return { ok: true };
	}

	/** Remember the request offset and the rolled-back build; a failed write only costs that memory. */
	#saveState(state: UpdaterState): Promise<void> {
		this.#state = state;
		this.#saving = this.#saving.then(() =>
			writeFile(this.#deps.statePath, JSON.stringify(state)).catch((error: unknown) =>
				log.warn("cannot save the updater's state", { error }),
			),
		);
		return this.#saving;
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
		const next = afterWait(status, now, this.#busy);
		if (next === status) this.#schedule();
		else this.#set(next);
	}
}
