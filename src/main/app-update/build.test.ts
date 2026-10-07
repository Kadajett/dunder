import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, type NpmRunner } from "./build";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function checkout(): string {
	const dir = mkdtempSync(join(tmpdir(), "app-update-build-"));
	dirs.push(dir);
	return dir;
}

/** Fake npm: logs its command, "builds" into the staging dir, exits with the given code. */
function fakeNpm(codes: { install?: number | null; build?: number | null } = {}) {
	const calls: string[] = [];
	const run: NpmRunner = async (root, args, log, onLog) => {
		const command = args[0] === "install" ? "install" : "build";
		calls.push(command);
		log.push(`npm ${command} output\n`);
		onLog();
		const code = command in codes ? (codes[command] ?? null) : 0;
		if (command === "build" && code === 0) mkdirSync(join(root, "out-next"));
		return code;
	};
	return { run: vi.fn(run), calls };
}

describe("buildApp", () => {
	it("installs before building when the dependencies changed, in the same log", async () => {
		const root = checkout();
		const npm = fakeNpm();
		const onLog = vi.fn();
		expect(await buildApp(root, onLog, { install: true, run: npm.run })).toEqual({ ok: true });
		expect(npm.calls).toEqual(["install", "build"]);
		expect(npm.run.mock.calls[0]?.[1]).toEqual(["install", "--no-audit", "--no-fund"]);
		expect(onLog).toHaveBeenLastCalledWith(
			expect.stringMatching(/install output[\s\S]*build output/),
		);
		expect(existsSync(join(root, "out"))).toBe(true);
	});

	it("only builds when the dependencies are unchanged", async () => {
		const npm = fakeNpm();
		expect(await buildApp(checkout(), vi.fn(), { install: false, run: npm.run })).toEqual({
			ok: true,
		});
		expect(npm.calls).toEqual(["build"]);
	});

	it.each([
		[1, "npm install failed: it exited with 1"],
		[null, "npm install failed: it did not finish"],
	])("fails without building when npm install ends with %s", async (code, error) => {
		const root = checkout();
		const npm = fakeNpm({ install: code });
		const result = await buildApp(root, vi.fn(), { install: true, run: npm.run });
		expect(result).toEqual({
			ok: false,
			error,
			logTail: expect.stringContaining("install output"),
		});
		expect(npm.calls).toEqual(["install"]);
		expect(existsSync(join(root, "out"))).toBe(false);
	});
});
