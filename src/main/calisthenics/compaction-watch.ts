import { readFile } from "node:fs/promises";
import { z } from "zod";
import { SessionTail } from "../omp/session-tail";

const entrySchema = z.object({ type: z.string() });

/** True when an omp session JSONL line records a compaction (`{"type":"compaction",…}`). */
export function isCompactionLine(line: string): boolean {
	// Cheap pre-filter: message lines can be large and are never compactions.
	if (!line.includes('"compaction"')) return false;
	try {
		const entry = entrySchema.safeParse(JSON.parse(line));
		return entry.success && entry.data.type === "compaction";
	} catch {
		return false;
	}
}

/** True once an omp session log holds at least one conversation message (so it can be compacted). */
export async function hasConversation(path: string): Promise<boolean> {
	try {
		return (await readFile(path, "utf8")).includes('{"type":"message"');
	} catch {
		return false;
	}
}

/**
 * Follows each agent's omp session log and reports every compaction appended
 * after tracking began. The log is omp's own durable record (a compaction
 * always writes one entry, whether manual, automatic or remote), unlike the
 * transient status-line text on the pane, which herdr may not even redraw.
 */
export class CompactionWatch {
	readonly #onCompaction: (agent: string) => void;
	readonly #pollMs: number;
	readonly #tails = new Map<string, SessionTail>();
	#timer: NodeJS.Timeout | undefined;
	#polling = false;

	constructor(onCompaction: (agent: string) => void, pollMs = 1_000) {
		this.#onCompaction = onCompaction;
		this.#pollMs = pollMs;
	}

	/** Follow exactly these agents (name → session JSONL path). */
	track(sessions: ReadonlyMap<string, string>): void {
		for (const [agent, tail] of this.#tails) {
			if (sessions.get(agent) !== tail.path) this.#tails.delete(agent);
		}
		for (const [agent, path] of sessions) {
			if (!this.#tails.has(agent)) this.#tails.set(agent, new SessionTail(path, "end"));
		}
	}

	start(): void {
		this.#timer ??= setInterval(() => void this.poll(), this.#pollMs);
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	/** Scan every followed log once; overlapping calls are skipped. */
	async poll(): Promise<void> {
		if (this.#polling) return;
		this.#polling = true;
		try {
			for (const [agent, tail] of this.#tails) {
				const count = (await tail.lines()).filter(isCompactionLine).length;
				for (let i = 0; i < count; i++) this.#onCompaction(agent);
			}
		} finally {
			this.#polling = false;
		}
	}
}
