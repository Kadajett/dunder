import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { agentNameSchema } from "@shared/company/roster";
import type { SeenDone } from "@shared/office-stats";
import { z } from "zod";

const seqSchema = z.number().int().nullable();

const seenFileSchema = z.object({
	version: z.literal(1),
	seen: z.record(z.string(), seqSchema),
});

/** `markSeen` payload from the renderer (untrusted). */
export const markSeenRequestSchema = z.strictObject({ name: agentNameSchema, seq: seqSchema });

/** The Trust Inbox's seen `done`s, persisted in one JSON file. */
export interface SeenDoneStore {
	all(): Promise<SeenDone>;
	mark(name: string, seq: number | null): Promise<void>;
}

/** A missing or unreadable file means nothing has been seen yet. */
async function load(path: string): Promise<SeenDone> {
	try {
		const parsed = seenFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
		return parsed.success ? parsed.data.seen : {};
	} catch {
		return {};
	}
}

async function save(path: string, seen: SeenDone): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify({ version: 1, seen }, null, "\t")}\n`, "utf8");
	await rename(temp, path);
}

/**
 * One entry per agent: marking a newer `done` replaces the older one. Marks
 * apply in call order and each write is atomic, so the file never holds a
 * half-written or out-of-order state.
 */
export function createSeenDoneStore(path: string): SeenDoneStore {
	let current = load(path);
	return {
		all: () => current,
		mark(name, seq) {
			const previous = current;
			const next = previous.then(async (seen) => {
				const updated = { ...seen, [name]: seq };
				await save(path, updated);
				return updated;
			});
			// A failed write keeps the last saved state for later marks.
			current = next.catch(() => previous);
			return next.then(() => undefined);
		},
	};
}
