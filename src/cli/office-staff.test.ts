import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { staffRequestLineSchema } from "@shared/staff";
import { afterEach, describe, expect, it, vi } from "vitest";

const CLI = join(import.meta.dirname, "office-staff.mts");

function env(state: string, paneId: string | undefined, waitMs: number): NodeJS.ProcessEnv {
	const { HERDR_PANE_ID: _inherited, ...rest } = process.env;
	return {
		...rest,
		XDG_STATE_HOME: state,
		OFFICE_STAFF_WAIT_MS: String(waitMs),
		...(paneId === undefined ? {} : { HERDR_PANE_ID: paneId }),
	};
}

/** Run the real CLI the way bin/office-staff does: plain Node, files under a temp state dir. */
function officeStaff(args: readonly string[], paneId: string | undefined, state: string) {
	return spawnSync(process.execPath, [CLI, ...args], {
		env: env(state, paneId, 0),
		encoding: "utf8",
	});
}

const requestsFile = (state: string) => join(state, "dunder", "staff-requests.ndjson");

describe("office-staff", () => {
	const dirs: string[] = [];
	const stateDir = (): string => {
		const dir = mkdtempSync(join(tmpdir(), "office-staff-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it.each([
		["unset", undefined],
		["empty", ""],
	])("refuses to request anything when HERDR_PANE_ID is %s", (_case, paneId) => {
		const state = stateDir();
		const run = officeStaff(["fire", "jonas"], paneId, state);
		expect(run.status).toBe(1);
		expect(run.stderr).toContain("HERDR_PANE_ID is not set");
		expect(existsSync(requestsFile(state))).toBe(false);
	});

	it.each([[[]], [["hire", "raina"]], [["fire"]], [["model", "theo"]], [["promote", "theo"]]])(
		"rejects bad usage %j without requesting anything",
		(args) => {
			const state = stateDir();
			const run = officeStaff(args, "w9:p1", state);
			expect(run.status).toBe(2);
			expect(run.stderr + run.stdout).toContain("usage:");
			expect(existsSync(requestsFile(state))).toBe(false);
		},
	);

	it("appends a hire request the app accepts", () => {
		const state = stateDir();
		const args = [
			"hire",
			"raina",
			"--role",
			"product-manager",
			"--model",
			"anthropic/claude-opus-5-5:high",
		];
		const run = officeStaff([...args, "--brief", "Loves Zelda."], "w9:p1", state);
		expect(run.status).toBe(0);
		expect(run.stdout).toContain("has not answered yet");
		const line = staffRequestLineSchema.parse(
			JSON.parse(readFileSync(requestsFile(state), "utf8")),
		);
		expect(line).toMatchObject({
			fromPane: "w9:p1",
			request: {
				action: "hire",
				name: "raina",
				role: "product-manager",
				model: "anthropic/claude-opus-5-5:high",
				brief: "Loves Zelda.",
			},
		});
	});

	it("prints the app's answer and exits non-zero when it refused", async () => {
		const state = stateDir();
		const child = spawn(process.execPath, [CLI, "fire", "jonas"], {
			env: env(state, "w1:p1", 10_000),
		});
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
		const id = await vi.waitFor(
			() => staffRequestLineSchema.parse(JSON.parse(readFileSync(requestsFile(state), "utf8"))).id,
		);
		const answer = {
			v: 1,
			id,
			ok: false,
			message: "only the chief of staff (max) can change the staff",
		};
		appendFileSync(join(state, "dunder", "staff-results.ndjson"), `${JSON.stringify(answer)}\n`);
		expect(await exited).toBe(1);
		expect(stderr).toContain("only the chief of staff (max)");
	});

	it("finds the app's answer after the results file was rotated under it", async () => {
		const state = stateDir();
		const child = spawn(process.execPath, [CLI, "list"], { env: env(state, "w1:p1", 10_000) });
		let stdout = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		const exited = Promise.withResolvers<number | null>();
		child.on("exit", exited.resolve);
		const id = await vi.waitFor(
			() => staffRequestLineSchema.parse(JSON.parse(readFileSync(requestsFile(state), "utf8"))).id,
		);
		// The app answered, then rotated the file: the answer is in the old generation.
		const results = join(state, "dunder", "staff-results.ndjson");
		const answer = { v: 1, id, ok: true, message: "the roster: max, carl" };
		appendFileSync(`${results}.1`, `${JSON.stringify(answer)}\n`);
		appendFileSync(
			results,
			`${JSON.stringify({ v: 1, id: "someone-else", ok: true, message: "x" })}\n`,
		);
		expect(await exited.promise).toBe(0);
		expect(stdout).toContain("the roster: max, carl");
	});
});
