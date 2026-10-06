import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "@shared/log/logger";
import type { BoardDigest } from "@shared/whiteboard";
import { z } from "zod";

const log = createLogger("whiteboard");

/**
 * One board file per company, `<userData>/whiteboards/<companyId>.json`. Not
 * in `companies/`: that directory's loader treats every `*.json` as a company
 * and moves anything else aside.
 */
export function boardPath(dir: string, companyId: string): string {
	return join(dir, `${companyId}.json`);
}

/** The tldraw snapshot stays untyped here; `openBoard` migrates and validates it. */
const boardFileSchema = z.object({
	version: z.literal(1),
	companyId: z.string(),
	revision: z.number().int().nonnegative(),
	snapshot: z.object({ store: z.record(z.string(), z.unknown()), schema: z.unknown() }).nullable(),
});

export interface SavedBoard {
	readonly revision: number;
	/** Unchecked tldraw snapshot JSON, or null for an empty board. */
	readonly snapshot: unknown;
}

const EMPTY: SavedBoard = { revision: 0, snapshot: null };

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Keep a board the app cannot read under a dated name, so nothing overwrites it. */
export async function setAside(path: string, now: Date): Promise<void> {
	const aside = `${path}.invalid-${now.toISOString().replaceAll(":", "-")}`;
	log.warn("unreadable board moved aside; starting an empty one", { path, aside });
	await rename(path, aside);
}

/** The company's saved board; a missing file is an empty board, an unreadable one is moved aside. */
export async function loadBoard(path: string, now: Date): Promise<SavedBoard> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return EMPTY;
		throw error;
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	const parsed = boardFileSchema.safeParse(json);
	if (parsed.success) return { revision: parsed.data.revision, snapshot: parsed.data.snapshot };
	await setAside(path, now);
	return EMPTY;
}

/** Write via a temp file and rename, so a crash never leaves half a board. */
async function writeAtomically(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(value)}\n`, "utf8");
	await rename(temp, path);
}

export function saveBoard(path: string, companyId: string, board: SavedBoard): Promise<void> {
	return writeAtomically(path, { version: 1, companyId, ...board });
}

export function saveDigest(path: string, digest: BoardDigest): Promise<void> {
	return writeAtomically(path, digest);
}
