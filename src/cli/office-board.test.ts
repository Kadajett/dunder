import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boardRequestLineSchema } from "@shared/whiteboard";
import { afterEach, describe, expect, it } from "vitest";

const CLI = join(import.meta.dirname, "office-board.mts");

/** Run the real CLI as bin/office-board does: plain Node, files under a temp state dir. */
function officeBoard(args: readonly string[], state: string, paneId?: string) {
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

const requests = (state: string): unknown[] =>
	readFileSync(join(state, "dunder", "board-requests.ndjson"), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));

describe("office-board", () => {
	const dirs: string[] = [];
	const stateDir = (): string => {
		const dir = mkdtempSync(join(tmpdir(), "office-board-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("refuses to post anonymously when HERDR_PANE_ID is unset", () => {
		const state = stateDir();
		const run = officeBoard(["note", "ship it"], state);
		expect(run.status).not.toBe(0);
		expect(run.stderr).toContain("HERDR_PANE_ID is not set");
		expect(existsSync(join(state, "dunder", "board-requests.ndjson"))).toBe(false);
	});

	it("appends note, text and clear requests the app accepts", () => {
		const state = stateDir();
		expect(officeBoard(["note", "ship", "it", "--color", "pink"], state, "w1:p2").status).toBe(0);
		expect(officeBoard(["text", "Agenda", "--x", "10", "--y", "-20"], state, "w1:p2").status).toBe(
			0,
		);
		expect(officeBoard(["clear"], state, "w1:p2").status).toBe(0);
		const lines = requests(state).map((line) => boardRequestLineSchema.parse(line));
		expect(lines).toMatchObject([
			{ op: "note", text: "ship it", color: "pink", fromPane: "w1:p2" },
			{ op: "text", text: "Agenda", x: 10, y: -20 },
			{ op: "clear", fromPane: "w1:p2" },
		]);
	});

	it.each([
		[["note"], "nothing to post"],
		[["note", "hi", "--color", "purple"], "--color is one of"],
		[["text", "hi", "--color", "blue"], "for notes only"],
		[["note", "hi", "--x", "3"], "--x and --y must both be numbers"],
		[["note", "hi", "--size", "l"], "Unknown option"],
	])("rejects %j without posting", (args, message) => {
		const state = stateDir();
		const run = officeBoard(args, state, "w1:p2");
		expect(run.status).toBe(2);
		expect(run.stderr).toContain(message);
		expect(existsSync(join(state, "dunder", "board-requests.ndjson"))).toBe(false);
	});

	it("reads the board digest the app writes, author by author", () => {
		const state = stateDir();
		expect(officeBoard(["read"], state).stdout).toContain("The board is empty");
		mkdirSync(join(state, "dunder"), { recursive: true });
		const items = [
			{ kind: "note", author: "nora", text: "ship it\ntoday" },
			{ kind: "text", author: "jeremy", text: "Q4 ideas" },
		];
		const digest = { companyId: "acme", revision: 3, updatedAt: "2026-10-06T12:00:00Z", items };
		writeFileSync(join(state, "dunder", "board.json"), JSON.stringify(digest));
		const run = officeBoard(["read"], state);
		expect(run.status).toBe(0);
		expect(run.stdout).toBe("- [note] nora: ship it\n    today\n- [text] jeremy: Q4 ideas\n");
	});
});
