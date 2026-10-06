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

export interface PoolOptions {
	readonly isOpen: (paneId: string) => boolean;
	readonly emit: (view: PoolView) => void;
	readonly emitFrame: (frame: PoolFrame) => void;
}

/** The pool table with a fresh seed per app run, publishing its state for `office-pool`. */
export function createPool(options: PoolOptions): PoolService {
	const digestPath = officePoolDigestPath(process.env, homedir());
	return new PoolService({
		seed: randomInt(2 ** 31),
		isOpen: options.isOpen,
		emit: options.emit,
		emitFrame: options.emitFrame,
		saveDigest: (view) => saveDigest(digestPath, view),
	});
}
