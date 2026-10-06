import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@shared/log/logger";

const log = createLogger("app-dirs");

/** Electron's userData dir name before the app became Dunder (`productName: "herdr office"`). */
const LEGACY_USER_DATA_NAME = "herdr office";
/** XDG state dir names: office-say's mailbox lives here. */
const LEGACY_STATE_NAME = "herdr-office";
const STATE_NAME = "dunder";

export interface DirListing {
	readonly exists: boolean;
	readonly entries: readonly string[];
}

export interface MigrationRule {
	/** Any of these in the new dir means it is already in use, so nothing moves. */
	readonly markers: readonly string[];
	/** Which entries of the old dir are worth carrying over. */
	readonly include: (entry: string) => boolean;
}

/** Chromium caches and crash dumps: rebuilt on demand, not worth copying. */
const CHROMIUM_CACHES: Record<string, true> = {
	Cache: true,
	"Code Cache": true,
	GPUCache: true,
	DawnCache: true,
	DawnGraphiteCache: true,
	DawnWebGPUCache: true,
	GrShaderCache: true,
	ShaderCache: true,
	Crashpad: true,
	blob_storage: true,
};

/** userData: all the app wrote, minus Chromium's locks (they name the old process) and caches. */
export const USER_DATA_RULE: MigrationRule = {
	markers: ["roster.json", "companies"],
	include: (entry) => !entry.startsWith("Singleton") && CHROMIUM_CACHES[entry] !== true,
};

/** State dir: the mailbox only; its read offset lives in userData's switchboard.json. */
export const STATE_RULE: MigrationRule = {
	markers: ["mailbox.ndjson"],
	include: (entry) => entry === "mailbox.ndjson",
};

/**
 * Which entries of the old dir to copy into the new one: none when the old
 * dir is missing or the new one is already in use, never one the new dir
 * already has. Markers go last, so a copy cut short is retried next start.
 */
export function planMigration(
	from: DirListing,
	to: DirListing,
	rule: MigrationRule,
): readonly string[] {
	if (!from.exists) return [];
	const present = new Set(to.entries);
	if (rule.markers.some((marker) => present.has(marker))) return [];
	const wanted = from.entries.filter((entry) => rule.include(entry) && !present.has(entry));
	const markers = wanted.filter((entry) => rule.markers.includes(entry));
	return [...wanted.filter((entry) => !rule.markers.includes(entry)), ...markers];
}

function listing(dir: string): DirListing {
	if (!existsSync(dir)) return { exists: false, entries: [] };
	return { exists: true, entries: readdirSync(dir) };
}

/** Copies the planned entries from `from` into `to`; the old dir is never modified. */
function migrateDir(from: string, to: string, rule: MigrationRule): readonly string[] {
	const entries = planMigration(listing(from), listing(to), rule);
	if (entries.length === 0) return entries;
	mkdirSync(to, { recursive: true });
	for (const entry of entries) {
		cpSync(join(from, entry), join(to, entry), {
			recursive: true,
			force: false,
			errorOnExist: false,
			verbatimSymlinks: true,
		});
	}
	return entries;
}

export interface AppDirs {
	/** Electron's `appData` (`~/.config` on Linux). */
	readonly appData: string;
	/** Electron's `userData`, named after productName `Dunder`. */
	readonly userData: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly home: string;
}

/**
 * Carries a herdr office install over to Dunder. Call before anything reads
 * userData or the state dir; failures are logged and the app starts fresh.
 */
export function migrateLegacyDirs(dirs: AppDirs): void {
	const state = dirs.env["XDG_STATE_HOME"] || join(dirs.home, ".local", "state");
	const moves = [
		{ from: join(dirs.appData, LEGACY_USER_DATA_NAME), to: dirs.userData, rule: USER_DATA_RULE },
		{ from: join(state, LEGACY_STATE_NAME), to: join(state, STATE_NAME), rule: STATE_RULE },
	];
	for (const { from, to, rule } of moves) {
		try {
			const copied = migrateDir(from, to, rule);
			if (copied.length > 0) log.info("carried over the old app data", { from, to, copied });
		} catch (error) {
			log.warn("could not carry over the old app data", { from, to, error });
		}
	}
}
