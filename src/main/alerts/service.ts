import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AlertTarget } from "@shared/alerts";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import type { WorkBoard } from "@shared/work-board";
import { z } from "zod";
import {
	type AlertItem,
	addToBatch,
	askTriggers,
	type Batch,
	batchNotice,
	blockedTriggers,
	NOTHING_SEEN,
	type Seen,
} from "./triggers";

const log = createLogger("alerts");

const settingsSchema = z.object({ muted: z.boolean() });

export interface AlertDeps {
	readonly settingsPath: string;
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
 * chime; muted, nothing fires.
 */
export class AlertService {
	readonly #deps: AlertDeps;
	#seen: Seen = NOTHING_SEEN;
	#batch: Batch | null = null;
	#muted = false;
	#loaded: Promise<void> | undefined;

	constructor(deps: AlertDeps) {
		this.#deps = deps;
	}

	/** Read the saved mute (default: alerts on). */
	start(): Promise<void> {
		this.#loaded ??= readFile(this.#deps.settingsPath, "utf8")
			.then((text) => {
				this.#muted = settingsSchema.parse(JSON.parse(text)).muted;
			})
			.catch(() => undefined);
		return this.#loaded;
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

	updateSnapshot(snapshot: SessionSnapshot): void {
		const { seen, items } = blockedTriggers(this.#seen, snapshot.agents);
		this.#seen = seen;
		this.#fire(items);
	}

	updateBoard(board: WorkBoard): void {
		if (board.state !== "ok") return;
		const { seen, items } = askTriggers(this.#seen, board.asks);
		this.#seen = seen;
		this.#fire(items);
	}

	#fire(items: readonly AlertItem[]): void {
		if (items.length === 0 || this.#muted || this.#deps.isFocused()) return;
		const { batch, fresh } = addToBatch(this.#batch, items, this.#deps.now());
		this.#batch = batch;
		const first = batch.items[0];
		if (!first) return;
		this.#deps.show(batchNotice(batch.items), () => this.#deps.open(first.target));
		if (fresh) this.#deps.chime();
	}
}
