import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { officePoolDigestPath } from "../main/pool/create";
import { ELIGIBLE_AFTER_MS, newLounge, observe } from "../main/pool/lounge";
import { viewOf } from "../main/pool/view";
import { poolDigestPath } from "./office-pool.mts";

const CLI = join(import.meta.dirname, "office-pool.mts");

/** Run the real CLI as bin/office-pool does: plain Node, the digest under a temp state dir. */
function officePool(args: readonly string[], state: string) {
	return spawnSync(process.execPath, [CLI, ...args], {
		env: { ...process.env, XDG_STATE_HOME: state },
		encoding: "utf8",
	});
}

describe("office-pool", () => {
	const dirs: string[] = [];
	const stateDir = (): string => {
		const dir = mkdtempSync(join(tmpdir(), "office-pool-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("agrees with the app on the digest path, with and without XDG_STATE_HOME", () => {
		for (const env of [{ XDG_STATE_HOME: "/s" }, {}, { XDG_STATE_HOME: "" }]) {
			expect(poolDigestPath(env, "/home/j")).toBe(officePoolDigestPath(env, "/home/j"));
		}
		expect(officePoolDigestPath({}, "/home/j")).toBe("/home/j/.local/state/dunder/pool.json");
	});

	it("prints the table the app wrote, as one screen of text or as JSON", () => {
		const state = stateDir();
		expect(officePool(["state"], state).stdout).toContain("No pool table yet");
		const presences = ["theo", "mika"].map((name) => ({ name, free: true }));
		const lounge = observe(observe(newLounge(2), presences, 0), presences, ELIGIBLE_AFTER_MS);
		const view = viewOf(lounge, false);
		mkdirSync(join(state, "dunder"), { recursive: true });
		writeFileSync(join(state, "dunder", "pool.json"), JSON.stringify(view));

		const text = officePool(["state"], state);
		expect(text.status).toBe(0);
		expect(text.stdout).toContain(`Pool table: ${view.label}`);
		expect(text.stdout).toContain(
			`8-ball, shot 0: ${view.shooter} to shoot, ball in hand (kitchen).`,
		);
		expect(text.stdout).toMatch(/^ {2}8 \(black\) +x \+0\.\d{3} {2}y [+-]0\.\d{3}$/m);
		expect(text.stdout.split("\n").filter((line) => / x [+-]/.test(line))).toHaveLength(16);

		const json = officePool(["state", "--json"], state);
		expect(JSON.parse(json.stdout)).toEqual(view);
	});

	it("is read-only: anything but state is refused", () => {
		const run = officePool(["shoot", "--angle", "10"], stateDir());
		expect(run.status).toBe(2);
		expect(run.stderr).toContain("office-pool state");
	});
});
