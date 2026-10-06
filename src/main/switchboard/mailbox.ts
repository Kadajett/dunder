import { type FSWatcher, watch } from "node:fs";
import { mkdir, open, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";

export interface TailOptions {
	readonly path: string;
	/** Byte offset already processed (persisted across restarts). */
	readonly offset: number;
	/** Complete new lines, and the offset just past them. */
	onLines(lines: readonly string[], offset: number): void;
	onError(error: Error): void;
	readonly pollMs?: number;
}

export interface MailboxTail {
	stop(): void;
}

/** Read whole lines appended since `offset`; a trailing partial line waits for its newline. */
async function readNew(
	path: string,
	offset: number,
	onLines: TailOptions["onLines"],
): Promise<number> {
	const info = await stat(path).catch(() => undefined);
	if (!info) return 0;
	// The file shrank (rotated or cleared by hand): start over from the top.
	const start = info.size < offset ? 0 : offset;
	if (info.size === start) return start;
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(info.size - start);
		await handle.read(buffer, 0, buffer.length, start);
		const end = buffer.lastIndexOf(0x0a);
		if (end === -1) return start;
		const lines = buffer
			.subarray(0, end)
			.toString("utf8")
			.split("\n")
			.filter((line) => line.trim());
		onLines(lines, start + end + 1);
		return start + end + 1;
	} finally {
		await handle.close();
	}
}

/**
 * Follow the mailbox file: fs.watch for promptness plus a slow poll, because
 * directory watches miss events on some filesystems.
 */
export async function tailMailbox(options: TailOptions): Promise<MailboxTail> {
	await mkdir(dirname(options.path), { recursive: true });
	let offset = options.offset;
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
				offset = await readNew(options.path, offset, options.onLines);
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
