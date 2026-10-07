import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Snooze, type SnoozeChoice, snoozeSchema } from "@shared/inbox-snooze";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { type LiveItems, snoozeUntil, sortSnoozes, withSnooze } from "./snoozes";

const log = createLogger("alerts");

const fileSchema = z.array(snoozeSchema);
const UNKNOWN: LiveItems = { blocked: null, asks: null };

export interface SnoozeBookDeps {
	/** userData/inbox-snoozes.json */
	readonly path: string;
	readonly now: () => number;
	/** The running snoozes changed (for the renderer). */
	readonly emit: (snoozes: readonly Snooze[]) => void;
	/** These snoozes ran out with their item still there: it comes back as new. */
	readonly onDue: (keys: readonly string[]) => void;
}

/**
 * Jeremy's snoozed Trust Inbox items, kept across restarts. Each comes back
 * when its time is up (and counts as new); one whose agent unblocked or whose
 * ask closed simply drops.
 */
export class SnoozeBook {
	readonly #deps: SnoozeBookDeps;
	#snoozes: readonly Snooze[] = [];
	#live: LiveItems = UNKNOWN;
	#timer: NodeJS.Timeout | undefined;
	#loaded: Promise<void> | undefined;
	#saving: Promise<void> = Promise.resolve();

	constructor(deps: SnoozeBookDeps) {
		this.#deps = deps;
	}

	/** Read the saved snoozes once; a missing or broken file means none. */
	load(): Promise<void> {
		this.#loaded ??= readFile(this.#deps.path, "utf8")
			.then((text) => {
				this.#snoozes = fileSchema.safeParse(JSON.parse(text)).data ?? [];
			})
			.catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT")
					log.warn("inbox snoozes unreadable; starting with none", { error });
			})
			.then(() => {
				this.update(this.#live);
				this.#schedule();
			});
		return this.#loaded;
	}

	list(): readonly Snooze[] {
		return this.#snoozes;
	}

	has(key: string): boolean {
		return this.#snoozes.some((snooze) => snooze.key === key);
	}

	async snooze(key: string, choice: SnoozeChoice): Promise<void> {
		await this.load();
		const until = snoozeUntil(choice, this.#deps.now());
		await this.#set(withSnooze(this.#snoozes, { key, until }));
	}

	async unsnooze(key: string): Promise<void> {
		await this.load();
		await this.#set(this.#snoozes.filter((snooze) => snooze.key !== key));
	}

	/** What is live now: snoozes for items that are gone drop, those whose time is up come back. */
	update(live: LiveItems): void {
		this.#live = live;
		const { kept, due } = sortSnoozes(this.#snoozes, live, this.#deps.now());
		if (kept.length === this.#snoozes.length) return;
		void this.#set(kept);
		if (due.length > 0) this.#deps.onDue(due.map((snooze) => snooze.key));
	}

	stop(): void {
		clearTimeout(this.#timer);
	}

	#set(snoozes: readonly Snooze[]): Promise<void> {
		this.#snoozes = snoozes;
		this.#deps.emit(snoozes);
		this.#schedule();
		// In order: a slow write must never land after a newer one.
		this.#saving = this.#saving.then(() => this.#save(snoozes));
		return this.#saving;
	}

	async #save(snoozes: readonly Snooze[]): Promise<void> {
		try {
			await mkdir(dirname(this.#deps.path), { recursive: true });
			await writeFile(this.#deps.path, `${JSON.stringify(snoozes)}\n`, "utf8");
		} catch (error) {
			log.warn("could not save the inbox snoozes", { error });
		}
	}

	/** Wake when the next snooze runs out. */
	#schedule(): void {
		clearTimeout(this.#timer);
		const next = Math.min(...this.#snoozes.map((snooze) => snooze.until));
		if (!Number.isFinite(next)) return;
		this.#timer = setTimeout(() => this.update(this.#live), Math.max(0, next - this.#deps.now()));
		this.#timer.unref();
	}
}
