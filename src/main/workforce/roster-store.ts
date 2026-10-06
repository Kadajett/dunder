import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type Roster, rosterSchema } from "@shared/company/roster";
import { EMPTY_ROSTER } from "@shared/company/roster-ops";

export interface LoadedRoster {
	readonly roster: Roster;
	/** False on first run: the caller adopts the live staff. */
	readonly existed: boolean;
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Read the roster file. A file that fails validation is moved aside (never
 * silently overwritten) and treated as a first run.
 */
export async function loadRoster(path: string, now = new Date()): Promise<LoadedRoster> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return { roster: EMPTY_ROSTER, existed: false };
		throw error;
	}
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	const parsed = rosterSchema.safeParse(json);
	if (parsed.success) return { roster: parsed.data, existed: true };
	await rename(path, `${path}.invalid-${now.toISOString().replaceAll(":", "-")}`);
	return { roster: EMPTY_ROSTER, existed: false };
}

/** Write atomically: a crash mid-write leaves the previous roster intact. */
export async function saveRoster(path: string, roster: Roster): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const temp = `${path}.${process.pid}.tmp`;
	await writeFile(temp, `${JSON.stringify(roster, null, "\t")}\n`, "utf8");
	await rename(temp, path);
}
