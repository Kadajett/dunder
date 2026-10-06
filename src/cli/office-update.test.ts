import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "office-update.mts");

/** Run the real CLI the way bin/office-update does: plain Node, requests under a temp state dir. */
function officeUpdate(paneId: string | undefined, state: string) {
	const { HERDR_PANE_ID: _inherited, ...env } = process.env;
	return spawnSync(process.execPath, [CLI, "new TV channels"], {
		env: {
			...env,
			XDG_STATE_HOME: state,
			...(paneId === undefined ? {} : { HERDR_PANE_ID: paneId }),
		},
		encoding: "utf8",
	});
}

describe("office-update", () => {
	const dirs: string[] = [];
	const stateDir = (): string => {
		const dir = mkdtempSync(join(tmpdir(), "office-update-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it.each([
		["unset", undefined],
		["empty", ""],
	])("refuses to request anonymously when HERDR_PANE_ID is %s", (_case, paneId) => {
		const state = stateDir();
		const run = officeUpdate(paneId, state);
		expect(run.status).toBe(1);
		expect(run.stderr).toContain("HERDR_PANE_ID is not set");
		expect(run.stderr).toContain("bash tool");
		expect(run.stdout).toBe("");
		expect(existsSync(join(state, "dunder", "update-requests.ndjson"))).toBe(false);
	});

	it("drops a request from the requester's pane", () => {
		const state = stateDir();
		const run = officeUpdate("w1:p2", state);
		expect(run.status).toBe(0);
		const line = JSON.parse(readFileSync(join(state, "dunder", "update-requests.ndjson"), "utf8"));
		expect(line).toMatchObject({ v: 1, fromPane: "w1:p2", reason: "new TV channels" });
		expect(Object.keys(line).sort()).toEqual(["fromPane", "id", "reason", "requestedAt", "v"]);
	});
});
