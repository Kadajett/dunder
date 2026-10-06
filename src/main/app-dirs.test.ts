import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type DirListing,
	migrateLegacyDirs,
	planMigration,
	STATE_RULE,
	USER_DATA_RULE,
} from "./app-dirs";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
	const dir = mkdtempSync(join(tmpdir(), "dunder-app-dirs-"));
	dirs.push(dir);
	return dir;
}

const has = (...entries: string[]): DirListing => ({ exists: true, entries });
const missing: DirListing = { exists: false, entries: [] };

describe("planMigration", () => {
	it("copies the old userData, skipping Chromium locks and caches, markers last", () => {
		const old = has("companies", "roster.json", "SingletonLock", "GPUCache", "Local Storage");
		expect(planMigration(old, missing, USER_DATA_RULE)).toEqual([
			"Local Storage",
			"companies",
			"roster.json",
		]);
	});

	it("fills a new dir Chromium already started, without overwriting its entries", () => {
		const old = has("roster.json", "Preferences", "switchboard.json");
		expect(planMigration(old, has("Preferences"), USER_DATA_RULE)).toEqual([
			"switchboard.json",
			"roster.json",
		]);
	});

	it("leaves a new dir that is already in use alone", () => {
		const old = has("roster.json", "companies", "chief-chat.json");
		expect(planMigration(old, has("companies"), USER_DATA_RULE)).toEqual([]);
		expect(planMigration(old, has("roster.json"), USER_DATA_RULE)).toEqual([]);
	});

	it("does nothing without an old dir", () => {
		expect(planMigration(missing, missing, USER_DATA_RULE)).toEqual([]);
	});

	it("moves only the mailbox out of the old state dir, once", () => {
		const old = has("mailbox.ndjson", "update-requests.ndjson");
		expect(planMigration(old, missing, STATE_RULE)).toEqual(["mailbox.ndjson"]);
		expect(planMigration(old, has("mailbox.ndjson"), STATE_RULE)).toEqual([]);
	});
});

describe("migrateLegacyDirs", () => {
	function legacyInstall(root: string): { appData: string; state: string } {
		const appData = join(root, "config");
		const old = join(appData, "herdr office");
		mkdirSync(join(old, "companies"), { recursive: true });
		writeFileSync(join(old, "companies", "acme.json"), "{}");
		writeFileSync(join(old, "roster.json"), "[]");
		writeFileSync(join(old, "switchboard.json"), '{"offset":42}');
		const state = join(root, "state");
		mkdirSync(join(state, "herdr-office"), { recursive: true });
		writeFileSync(join(state, "herdr-office", "mailbox.ndjson"), "line\n");
		return { appData, state };
	}

	it("copies userData and the mailbox with its offset, keeping the old dirs", () => {
		const root = scratch();
		const { appData, state } = legacyInstall(root);
		const userData = join(appData, "Dunder");
		migrateLegacyDirs({ appData, userData, env: { XDG_STATE_HOME: state }, home: root });
		expect(readdirSync(userData).sort()).toEqual(["companies", "roster.json", "switchboard.json"]);
		expect(readFileSync(join(userData, "companies", "acme.json"), "utf8")).toBe("{}");
		expect(readFileSync(join(userData, "switchboard.json"), "utf8")).toBe('{"offset":42}');
		expect(readFileSync(join(state, "dunder", "mailbox.ndjson"), "utf8")).toBe("line\n");
		expect(readdirSync(join(appData, "herdr office")).sort()).toEqual([
			"companies",
			"roster.json",
			"switchboard.json",
		]);
		expect(readdirSync(join(state, "herdr-office"))).toEqual(["mailbox.ndjson"]);
	});

	it("never overwrites data the new dirs already hold", () => {
		const root = scratch();
		const { appData, state } = legacyInstall(root);
		const userData = join(appData, "Dunder");
		mkdirSync(userData);
		writeFileSync(join(userData, "roster.json"), "new");
		mkdirSync(join(state, "dunder"));
		writeFileSync(join(state, "dunder", "mailbox.ndjson"), "new\n");
		migrateLegacyDirs({ appData, userData, env: { XDG_STATE_HOME: state }, home: root });
		expect(readdirSync(userData)).toEqual(["roster.json"]);
		expect(readFileSync(join(userData, "roster.json"), "utf8")).toBe("new");
		expect(readFileSync(join(state, "dunder", "mailbox.ndjson"), "utf8")).toBe("new\n");
	});

	it("leaves a fresh install untouched", () => {
		const root = scratch();
		const userData = join(root, "config", "Dunder");
		migrateLegacyDirs({ appData: join(root, "config"), userData, env: {}, home: root });
		expect(readdirSync(root)).toEqual([]);
	});
});
