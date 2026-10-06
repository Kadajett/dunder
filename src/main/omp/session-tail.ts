import { open, stat } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";

/** Read at most this much new session log per tail per scan. */
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

async function sizeOf(path: string): Promise<number | undefined> {
	try {
		return (await stat(path)).size;
	} catch {
		return undefined;
	}
}

async function readFrom(path: string, offset: number, length: number): Promise<Buffer> {
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(length);
		const { bytesRead } = await handle.read(buffer, 0, length, offset);
		return buffer.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}

/**
 * One omp session log (JSONL), read incrementally: each scan returns the
 * complete lines appended since the previous one. `"start"` replays the
 * existing history first; `"end"` treats it as old news. A log that does not
 * exist yet is read from its first byte either way.
 */
export class SessionTail {
	readonly path: string;
	readonly #from: "start" | "end";
	/** Bytes already scanned; undefined until the first scan decides where to start. */
	#offset: number | undefined;
	#partial = "";
	#decoder = new StringDecoder("utf8");

	constructor(path: string, from: "start" | "end") {
		this.path = path;
		this.#from = from;
	}

	async lines(): Promise<string[]> {
		const size = await sizeOf(this.path);
		if (this.#offset === undefined) {
			this.#offset = this.#from === "end" ? (size ?? 0) : 0;
			if (this.#from === "end") return [];
		}
		if (size === undefined || size === this.#offset) return [];
		if (size < this.#offset) {
			// Rewritten in place: resume from its new end.
			this.#offset = size;
			this.#partial = "";
			this.#decoder = new StringDecoder("utf8");
			return [];
		}
		const length = Math.min(size - this.#offset, MAX_CHUNK_BYTES);
		const chunk = await readFrom(this.path, this.#offset, length);
		this.#offset += chunk.length;
		const lines = (this.#partial + this.#decoder.write(chunk)).split("\n");
		this.#partial = lines.pop() ?? "";
		return lines;
	}
}
