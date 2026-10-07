import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createLogger } from "@shared/log/logger";
import { type CallResume, type CallSnapshot, callSnapshotSchema } from "@shared/voice";

const log = createLogger("voice");

/** A relaunch older than this (the app was down, not just restarting) never picks a call back up. */
export const CALL_RESUME_WINDOW_MS = 2 * 60_000;

/** The call to pick up: one was live, and the last process went down for an update moments ago. */
export function callToResume(
	call: CallSnapshot | null,
	downAt: number | null,
	now: number,
): CallResume | null {
	if (call === null || downAt === null) return null;
	if (now < downAt || now - downAt > CALL_RESUME_WINDOW_MS) return null;
	return { ...call, downAt };
}

async function loadCall(path: string): Promise<CallSnapshot | null> {
	try {
		const parsed = callSnapshotSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

async function writeCall(path: string, call: CallSnapshot | null): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(call)}\n`, "utf8");
	await rename(temp, path);
}

export interface CallKeeperDeps {
	/** `<userData>/call.json`. */
	readonly path: string;
	/** When the last process went down for an update relaunch, or null. */
	readonly relaunchedAt: () => Promise<number | null>;
	readonly now: () => number;
}

/**
 * Keeps Jeremy's live call on disk, so an update's relaunch picks it back up
 * with the same mic. A quit or a crash during a call doesn't: only the
 * updater marks a relaunch.
 */
export class CallKeeper {
	readonly #path: string;
	#resume: Promise<CallResume | null>;
	#saving: Promise<void> = Promise.resolve();
	/** The renderer's last word on the call: one is running. */
	#live = false;

	constructor(deps: CallKeeperDeps) {
		this.#path = deps.path;
		this.#resume = Promise.all([loadCall(deps.path), deps.relaunchedAt()])
			.then(([call, downAt]) => callToResume(call, downAt, deps.now()))
			.catch((error: unknown) => {
				log.warn("cannot read the call to resume", { error });
				return null;
			});
	}

	/** Saves land in call order. */
	save(call: CallSnapshot | null): Promise<void> {
		this.#live = call !== null;
		this.#saving = this.#saving
			.then(() => writeCall(this.#path, call))
			.catch((error: unknown) => log.warn("cannot save the call", { error }));
		return this.#saving;
	}

	/** Jeremy is on a call with the chief right now (as the renderer last saved it). */
	live(): boolean {
		return this.#live;
	}

	/** The call to resume, once per launch (a renderer reload starts with no call). */
	take(): Promise<CallResume | null> {
		const resume = this.#resume;
		this.#resume = Promise.resolve(null);
		return resume;
	}
}
