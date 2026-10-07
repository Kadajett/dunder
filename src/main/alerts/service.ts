import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AlertTarget } from "@shared/alerts";
import { agentName } from "@shared/herdr/agent-label";
import type { AgentInfo, SessionSnapshot } from "@shared/herdr/schema";
import type { Snooze, SnoozeChoice } from "@shared/inbox-snooze";
import { createLogger } from "@shared/log/logger";
import type { HumanAsk, WorkBoard } from "@shared/work-board";
import { z } from "zod";
import { SnoozeBook } from "./snooze-book";
import type { LiveItems } from "./snoozes";
import {
	type AlertItem,
	addToBatch,
	askItem,
	askTriggers,
	type Batch,
	batchNotice,
	blockedItem,
	blockedTriggers,
	NOTHING_SEEN,
	type Seen,
} from "./triggers";

const log = createLogger("alerts");

const settingsSchema = z.object({ muted: z.boolean() });

export interface AlertDeps {
	readonly settingsPath: string;
	/** Where Jeremy's inbox snoozes are kept. */
	readonly snoozesPath: string;
	/** The running snoozes changed. */
	readonly emitSnoozes: (snoozes: readonly Snooze[]) => void;
	readonly now: () => number;
	/** Dunder's window is the one Jeremy is looking at. */
	readonly isFocused: () => boolean;
	/** Show the desktop notification, replacing the batch's earlier one. */
	readonly show: (
		notice: { readonly title: string; readonly body: string },
		onClick: () => void,
	) => void;
	/** Ask the renderer for the soft chime. */
	readonly chime: () => void;
	/** Raise the window and open the Trust Inbox on `target`. */
	readonly open: (target: AlertTarget) => void;
}

/**
 * Needs-you alerts: an agent turning blocked, or a new bd human ask, while
 * Dunder isn't focused. Triggers within 30 s share one notification and one
 * chime; muted, nothing fires. Snoozed items never alert; when a snooze runs
 * out its item counts as new and alerts like any other.
 */
export class AlertService {
	readonly #deps: AlertDeps;
	readonly #snoozes: SnoozeBook;
	#seen: Seen = NOTHING_SEEN;
	#batch: Batch | null = null;
	#muted = false;
	#loaded: Promise<void> | undefined;
	#agents: readonly AgentInfo[] | null = null;
	#asks: readonly HumanAsk[] | null = null;

	constructor(deps: AlertDeps) {
		this.#deps = deps;
		this.#snoozes = new SnoozeBook({
			path: deps.snoozesPath,
			now: deps.now,
			emit: deps.emitSnoozes,
			onDue: (keys) => this.#fire(this.#itemsFor(keys)),
		});
	}

	/** Read the saved mute (default: alerts on) and the snoozes. */
	start(): Promise<void> {
		this.#loaded ??= Promise.all([
			readFile(this.#deps.settingsPath, "utf8")
				.then((text) => {
					this.#muted = settingsSchema.parse(JSON.parse(text)).muted;
				})
				.catch(() => undefined),
			this.#snoozes.load(),
		]).then(() => undefined);
		return this.#loaded;
	}

	stop(): void {
		this.#snoozes.stop();
	}

	async muted(): Promise<boolean> {
		await this.start();
		return this.#muted;
	}

	async setMuted(muted: boolean): Promise<void> {
		await this.start();
		this.#muted = muted;
		if (muted) this.#batch = null;
		await mkdir(dirname(this.#deps.settingsPath), { recursive: true });
		await writeFile(this.#deps.settingsPath, `${JSON.stringify({ muted })}\n`, "utf8").catch(
			(error: unknown) => log.warn("could not save the alerts setting", { error }),
		);
	}

	async snoozes(): Promise<readonly Snooze[]> {
		await this.start();
		return this.#snoozes.list();
	}

	snooze(key: string, choice: SnoozeChoice): Promise<void> {
		return this.#snoozes.snooze(key, choice);
	}

	unsnooze(key: string): Promise<void> {
		return this.#snoozes.unsnooze(key);
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#agents = snapshot.agents;
		this.#snoozes.update(this.#live());
		const { seen, items } = blockedTriggers(this.#seen, snapshot.agents);
		this.#seen = seen;
		this.#fire(items);
	}

	updateBoard(board: WorkBoard): void {
		if (board.state !== "ok") return;
		this.#asks = board.asks;
		this.#snoozes.update(this.#live());
		const { seen, items } = askTriggers(this.#seen, board.asks);
		this.#seen = seen;
		this.#fire(items);
	}

	/** Blocked agents (by name) and open asks; unknown until the first snapshot or board. */
	#live(): LiveItems {
		return {
			blocked: this.#agents ? new Set(this.#blocked().map(agentName)) : null,
			asks: this.#asks ? new Set(this.#asks.map((ask) => ask.id)) : null,
		};
	}

	#blocked(): AgentInfo[] {
		return (this.#agents ?? []).filter((agent) => agent.agent_status === "blocked");
	}

	/** The alerts for items whose snooze ran out, while they still need Jeremy. */
	#itemsFor(keys: readonly string[]): AlertItem[] {
		const items = [...this.#blocked().map(blockedItem), ...(this.#asks ?? []).map(askItem)];
		return items.filter((item) => keys.includes(item.snoozeKey));
	}

	#fire(items: readonly AlertItem[]): void {
		const awake = items.filter((item) => !this.#snoozes.has(item.snoozeKey));
		if (awake.length === 0 || this.#muted || this.#deps.isFocused()) return;
		const { batch, fresh } = addToBatch(this.#batch, awake, this.#deps.now());
		this.#batch = batch;
		const first = batch.items[0];
		if (!first) return;
		this.#deps.show(batchNotice(batch.items), () => this.#deps.open(first.target));
		if (fresh) this.#deps.chime();
	}
}
