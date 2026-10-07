import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createLogger } from "@shared/log/logger";
import type { BoardDigest, WhiteboardScene } from "@shared/whiteboard";
import { z } from "zod";
import { parseScene } from "./board-doc";
import { importTldrawSnapshot } from "./tldraw-import";

const log = createLogger("whiteboard");

/**
 * One board file per company, `<userData>/whiteboards/<companyId>.json`. Not
 * in `companies/`: that directory's loader treats every `*.json` as a company
 * and moves anything else aside.
 */
export function boardPath(dir: string, companyId: string): string {
	return join(dir, `${companyId}.json`);
}

/** The Excalidraw scene stays untyped here; `parseScene` checks it. */
const boardFileSchema = z.object({
	version: z.literal(2),
	companyId: z.string(),
	revision: z.number().int().nonnegative(),
	scene: z.unknown(),
});

/** A board the tldraw whiteboard saved: a tldraw store snapshot. */
const tldrawFileSchema = z.object({
	version: z.literal(1),
	companyId: z.string(),
	revision: z.number().int().nonnegative(),
	snapshot: z.unknown(),
});

export interface SavedBoard {
	readonly revision: number;
	/** null for an empty board. */
	readonly scene: WhiteboardScene | null;
}

const EMPTY: SavedBoard = { revision: 0, scene: null };

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** Keep a board the app cannot read under a dated name, so nothing overwrites it. */
export async function setAside(path: string, now: Date, why = "invalid"): Promise<void> {
	const aside = `${path}.${why}-${now.toISOString().replaceAll(":", "-")}`;
	log.warn("board moved aside", { path, aside, why });
	await rename(path, aside);
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * The company's saved board; a missing file is an empty board, an unreadable
 * one is moved aside. A tldraw board comes across as its notes and text (see
 * `importTldrawSnapshot`), saved in the new format; the old file is kept aside.
 */
export async function loadBoard(path: string, now: Date): Promise<SavedBoard> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return EMPTY;
		throw error;
	}
	const json = parseJson(text);
	const saved = boardFileSchema.safeParse(json);
	if (saved.success) {
		const scene = sceneOrNull(saved.data.scene);
		if (scene !== undefined) return { revision: saved.data.revision, scene };
	}
	const tldraw = tldrawFileSchema.safeParse(json);
	if (tldraw.success) {
		const board = {
			revision: tldraw.data.revision,
			scene: importTldrawSnapshot(tldraw.data.snapshot),
		};
		await setAside(path, now, "tldraw");
		await saveBoard(path, tldraw.data.companyId, board);
		return board;
	}
	await setAside(path, now);
	return EMPTY;
}

/** null stays an empty board; undefined: not a scene at all. */
function sceneOrNull(json: unknown): WhiteboardScene | null | undefined {
	if (json === null) return null;
	try {
		return parseScene(json);
	} catch {
		return undefined;
	}
}

/** Write via a temp file and rename, so a crash never leaves half a board. */
async function writeAtomically(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(value)}\n`, "utf8");
	await rename(temp, path);
}

export function saveBoard(path: string, companyId: string, board: SavedBoard): Promise<void> {
	return writeAtomically(path, { version: 2, companyId, ...board });
}

export function saveDigest(path: string, digest: BoardDigest): Promise<void> {
	return writeAtomically(path, digest);
}
