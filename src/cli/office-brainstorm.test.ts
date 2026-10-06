import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brainstormRequestLineSchema } from "@shared/brainstorm";
import { afterEach, describe, expect, it } from "vitest";
import { officeBrainstormRequestsPath } from "../main/brainstorm/create";
import { brainstormRequestsPath } from "./office-brainstorm.mts";

const CLI = join(import.meta.dirname, "office-brainstorm.mts");

/** Run the real CLI as bin/office-brainstorm does: plain Node, files under a temp state dir. */
function officeBrainstorm(args: readonly string[], state: string, paneId?: string) {
	const { HERDR_PANE_ID: _inherited, ...env } = process.env;
	return spawnSync(process.execPath, [CLI, ...args], {
		env: {
			...env,
			XDG_STATE_HOME: state,
			...(paneId === undefined ? {} : { HERDR_PANE_ID: paneId }),
		},
		encoding: "utf8",
	});
}

describe("office-brainstorm", () => {
	const dirs: string[] = [];
	const stateDir = (): string => {
		const dir = mkdtempSync(join(tmpdir(), "office-brainstorm-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("appends start and end requests the app accepts", () => {
		const state = stateDir();
		expect(officeBrainstorm(["start", "Q4", "launch"], state, "w1:p1").status).toBe(0);
		expect(officeBrainstorm(["end"], state, "w1:p1").status).toBe(0);
		const lines = readFileSync(join(state, "dunder", "brainstorm-requests.ndjson"), "utf8")
			.trim()
			.split("\n")
			.map((text) => brainstormRequestLineSchema.parse(JSON.parse(text)));
		expect(lines).toMatchObject([
			{ op: "start", topic: "Q4 launch", fromPane: "w1:p1" },
			{ op: "end", fromPane: "w1:p1" },
		]);
	});

	it("sends nothing without a pane or a topic", () => {
		const state = stateDir();
		expect(officeBrainstorm(["start", "Q4"], state).stderr).toContain("HERDR_PANE_ID is not set");
		expect(officeBrainstorm(["start"], state, "w1:p1").status).not.toBe(0);
		expect(existsSync(join(state, "dunder", "brainstorm-requests.ndjson"))).toBe(false);
	});

	it("writes where the app reads, with and without XDG_STATE_HOME", () => {
		for (const env of [{ XDG_STATE_HOME: "/s" }, {}, { XDG_STATE_HOME: "" }]) {
			expect(brainstormRequestsPath(env, "/home/j")).toBe(
				officeBrainstormRequestsPath(env, "/home/j"),
			);
		}
	});
});
