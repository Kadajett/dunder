import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "office-say.mts");

/** Run the real CLI the way bin/office-say does: plain Node, mailbox under a temp state dir. */
function officeSay(paneId: string | undefined, state: string) {
	const { HERDR_PANE_ID: _inherited, ...env } = process.env;
	return spawnSync(process.execPath, [CLI, "ava", "Hi Ava!"], {
		env: {
			...env,
			XDG_STATE_HOME: state,
			...(paneId === undefined ? {} : { HERDR_PANE_ID: paneId }),
		},
		encoding: "utf8",
	});
}

describe("office-say", () => {
	const dirs: string[] = [];
	const stateDir = (): string => {
		const dir = mkdtempSync(join(tmpdir(), "office-say-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it.each([
		["unset", undefined],
		["empty", ""],
	])("refuses to send anonymously when HERDR_PANE_ID is %s", (_case, paneId) => {
		const state = stateDir();
		const run = officeSay(paneId, state);
		expect(run.status).not.toBe(0);
		expect(run.stderr).toContain("HERDR_PANE_ID is not set");
		expect(run.stderr).toContain("bash tool");
		expect(run.stdout).toBe("");
		expect(existsSync(join(state, "dunder", "mailbox.ndjson"))).toBe(false);
	});

	it("drops a line from the sender's pane in the mailbox", () => {
		const state = stateDir();
		const run = officeSay("w1:p2", state);
		expect(run.status).toBe(0);
		const line = JSON.parse(readFileSync(join(state, "dunder", "mailbox.ndjson"), "utf8"));
		expect(line).toMatchObject({ v: 1, fromPane: "w1:p2", to: "ava", text: "Hi Ava!" });
		expect(Object.keys(line).sort()).toEqual(["fromPane", "id", "sentAt", "text", "to", "v"]);
	});
});
