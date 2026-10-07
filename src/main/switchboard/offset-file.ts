import { readFile } from "node:fs/promises";
import { z } from "zod";

const offsetSchema = z.object({ offset: z.number().int().nonnegative() });

/**
 * A tail's saved read offset (`{"offset": n}`), or null when it is missing or
 * unreadable: an interrupted write leaves the file empty, and a lost place
 * must never stop the tail from starting.
 */
export async function readSavedOffset(path: string): Promise<number | null> {
	const text = await readFile(path, "utf8").catch(() => null);
	if (text === null) return null;
	try {
		return offsetSchema.safeParse(JSON.parse(text)).data?.offset ?? null;
	} catch {
		return null;
	}
}
