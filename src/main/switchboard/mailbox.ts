import { type FSWatcher, watch } from "node:fs";
import { mkdir, open, rename, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";

/** A tailed file is rotated once it has been fully read and is at least this big. */
export const ROTATE_AT_BYTES = 256 * 1024;
/**
 * How long the rotated generation is still read after a rotation: a CLI that
 * opened the file just before the rename appends to it (open, write and close
 * take microseconds, so a few seconds is generous).
 */
const DRAIN_MS = 5_000;

/** Where a file's previous generation goes when it is rotated. */
export const rotatedPath = (path: string): string => `${path}.1`;

export interface TailOptions {
	readonly path: string;
	/** Byte offset already processed (persisted across restarts). */
	readonly offset: number;
	/**
	 * Complete new lines, and the offset in `path` just past them. After a
	 * rotation the offset restarts at 0 (reported with no lines, so callers
	 * persist it), and lines drained from the old generation report the
	 * current offset.
	 */
	onLines(lines: readonly string[], offset: number): void;
	onError(error: Error): void;
	readonly pollMs?: number;
	/** Rotate `path` to `<path>.1` past this size; the tail must be the file's only reader. */
	readonly rotateAtBytes?: number;
}

export interface MailboxTail {
	stop(): void;
}

interface ReadResult {
	readonly lines: readonly string[];
	/** Just past the last whole line read. */
	readonly offset: number;
	readonly size: number;
}

/** Whole lines appended since `offset`; a trailing partial line waits for its newline. */
async function readNew(path: string, offset: number): Promise<ReadResult> {
	const info = await stat(path).catch(() => undefined);
	if (!info) return { lines: [], offset: 0, size: 0 };
	// The file shrank (cleared by hand): start over from the top.
	const start = info.size < offset ? 0 : offset;
	if (info.size === start) return { lines: [], offset: start, size: info.size };
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(info.size - start);
		await handle.read(buffer, 0, buffer.length, start);
		const end = buffer.lastIndexOf(0x0a);
		if (end === -1) return { lines: [], offset: start, size: info.size };
		const lines = buffer
			.subarray(0, end)
			.toString("utf8")
			.split("\n")
			.filter((line) => line.trim());
		return { lines, offset: start + end + 1, size: info.size };
	} finally {
		await handle.close();
	}
}

/** The tail's reading state: the live file's offset, and the old generation still draining. */
class TailReader {
	readonly #options: TailOptions;
	#offset: number;
	#drain: { offset: number; until: number } | undefined;

	constructor(options: TailOptions) {
		this.#options = options;
		this.#offset = options.offset;
	}
	async read(): Promise<void> {
		const { path, onLines } = this.#options;
		if (this.#drain) {
			const old = await readNew(rotatedPath(path), this.#drain.offset);
			this.#drain.offset = old.offset;
			if (Date.now() >= this.#drain.until) this.#drain = undefined;
			if (old.lines.length > 0) onLines(old.lines, this.#offset);
		}
		const live = await readNew(path, this.#offset);
		this.#offset = live.offset;
		if (live.lines.length > 0) onLines(live.lines, live.offset);
		// Fully read (no partial line pending) and big enough: start a new generation.
		if (live.offset === live.size && live.size >= (this.#options.rotateAtBytes ?? ROTATE_AT_BYTES))
			await this.#rotate();
	}

	async #rotate(): Promise<void> {
		await rename(this.#options.path, rotatedPath(this.#options.path));
		// Anything appended between the read and the rename landed past `#offset` in the old file.
		this.#drain = { offset: this.#offset, until: Date.now() + DRAIN_MS };
		this.#offset = 0;
		this.#options.onLines([], 0);
		await this.read();
	}
}

/**
 * Follow an ndjson file other processes append to: fs.watch for promptness
 * plus a slow poll, because directory watches miss events on some
 * filesystems. The file is rotated once read past `rotateAtBytes`.
 */
export async function tailMailbox(options: TailOptions): Promise<MailboxTail> {
	await mkdir(dirname(options.path), { recursive: true });
	const reader = new TailReader(options);
	let reading = false;
	let again = false;
	let stopped = false;
	const read = async (): Promise<void> => {
		if (reading) {
			again = true;
			return;
		}
		reading = true;
		try {
			do {
				again = false;
				await reader.read();
			} while (again && !stopped);
		} catch (error) {
			options.onError(error instanceof Error ? error : new Error(String(error)));
		} finally {
			reading = false;
		}
	};
	const watcher: FSWatcher = watch(dirname(options.path), (_event, file) => {
		if (file === basename(options.path)) void read();
	});
	const timer = setInterval(() => void read(), options.pollMs ?? 2_000);
	void read();
	return {
		stop() {
			stopped = true;
			watcher.close();
			clearInterval(timer);
		},
	};
}
