import { readFile, writeFile } from "node:fs/promises";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";

const log = createLogger("app-update");

/**
 * An agents' update that was asked for but hasn't applied yet (batched, held,
 * counting down, or asked for during a build). Kept on disk so a restart
 * doesn't lose it: the request's offset is saved before it is acted on.
 */
const pendingSchema = z.object({
	by: z.string(),
	reason: z.string(),
	/** Earlier requests folded in. */
	extra: z.number().int().nonnegative(),
	/** One of them was a hotfix: it skips the batch window. */
	hotfix: z.literal(true).optional(),
});
export type PendingUpdate = z.infer<typeof pendingSchema>;

const stateSchema = z.object({
	offset: z.number().int().nonnegative(),
	/** The build Jeremy rolled back from: agents' updates stay off until an update of his applies. */
	rolledBackFrom: z.string().optional(),
	/** When an update (or rollback) last applied: agents' updates batch for the interval after it. */
	lastAppliedAt: z.number().optional(),
	pending: pendingSchema.optional(),
});
export type UpdaterState = z.infer<typeof stateSchema>;

/**
 * `app-update.json`: the request offset, the rollback pin, the batch window's
 * start and the pending update. Writes land in order; an unreadable file
 * (missing, empty after an interrupted write, or corrupt) reads as a fresh
 * start, never stopping the updater.
 */
export class UpdaterStateFile {
	readonly #path: string;
	#state: UpdaterState = { offset: 0 };
	#saving: Promise<void> = Promise.resolve();

	constructor(path: string) {
		this.#path = path;
	}

	get state(): UpdaterState {
		return this.#state;
	}

	async load(): Promise<void> {
		const text = await readFile(this.#path, "utf8").catch(() => null);
		if (text === null) return;
		try {
			this.#state = stateSchema.safeParse(JSON.parse(text)).data ?? { offset: 0 };
		} catch {
			log.warn("app-update.json is unreadable; starting fresh", { path: this.#path });
		}
	}

	/** A failed write only costs that memory. */
	save(state: UpdaterState): Promise<void> {
		this.#state = state;
		this.#saving = this.#saving.then(() =>
			writeFile(this.#path, JSON.stringify(state)).catch((error: unknown) =>
				log.warn("cannot save the updater's state", { error }),
			),
		);
		return this.#saving;
	}

	/** The same state with `pending` set, or removed when undefined. */
	withPending(pending: PendingUpdate | undefined): UpdaterState {
		const { pending: _old, ...rest } = this.#state;
		return pending ? { ...rest, pending } : rest;
	}
}
