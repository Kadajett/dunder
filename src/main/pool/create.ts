import { randomInt } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PoolFrame, PoolView } from "@shared/pool";
import { PoolService } from "./service";

/**
 * Must match `poolDigestPath` in src/cli/office-pool.mts, which cannot import
 * app code (it runs under plain Node); office-pool.test.ts keeps them in step.
 */
export function officePoolDigestPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder", "pool.json");
}

/** Write via a temp file and rename, so `office-pool` never reads half a table. */
async function saveDigest(path: string, view: PoolView): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(view)}\n`, "utf8");
	await rename(temp, path);
}

/**
 * One write at a time, always of the newest value: a call while a write runs
 * replaces any value still waiting. Every caller's promise settles once its
 * value (or a newer one) is written; it rejects with the last failure, if any.
 */
export function latestOnly<T>(write: (value: T) => Promise<void>): (value: T) => Promise<void> {
	let waiting: { readonly value: T } | undefined;
	let running: Promise<void> | undefined;
	async function drain(): Promise<void> {
		let failure: { readonly error: unknown } | undefined;
		while (waiting) {
			const { value } = waiting;
			waiting = undefined;
			// A failed write must not strand a newer value behind it.
			await write(value).catch((error: unknown) => {
				failure = { error };
			});
		}
		running = undefined;
		if (failure) throw failure.error;
	}
	return (value) => {
		waiting = { value };
		running ??= drain();
		return running;
	};
}

export interface PoolOptions {
	readonly isOpen: (paneId: string) => boolean;
	readonly inBrainstorm: (name: string) => boolean;
	readonly emit: (view: PoolView) => void;
	readonly emitFrame: (frame: PoolFrame) => void;
}

/** The pool table with a fresh seed per app run, publishing its state for `office-pool`. */
export function createPool(options: PoolOptions): PoolService {
	const digestPath = officePoolDigestPath(process.env, homedir());
	const save = latestOnly((view: PoolView) => saveDigest(digestPath, view));
	return new PoolService({
		seed: randomInt(2 ** 31),
		isOpen: options.isOpen,
		inBrainstorm: options.inBrainstorm,
		emit: options.emit,
		emitFrame: options.emitFrame,
		saveDigest: save,
	});
}
