import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PreviousBuild, UpdateStatus } from "@shared/app-update";
import { type SessionSnapshot, sessionSnapshotSchema } from "@shared/herdr/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "./build";
import { AppUpdater } from "./service";
import type { UpdateCheck } from "./status";

const BUILT = "a".repeat(40);
const HEAD = "b".repeat(40);
const NEW: UpdateCheck = { head: HEAD, commits: [{ sha: HEAD, subject: "TV channels" }] };

afterEach(() => {
	vi.useRealTimers();
});

function office(): SessionSnapshot {
	return sessionSnapshotSchema.parse({
		version: "0.9.3",
		protocol: 22,
		workspaces: [],
		tabs: [],
		panes: [],
		agents: [
			{
				pane_id: "w1:p1",
				tab_id: "w1:t1",
				workspace_id: "w1",
				terminal_id: "t1",
				focused: false,
				agent_status: "idle",
				agent: "omp",
				name: "max",
			},
		],
	});
}

function setup(check: UpdateCheck = NEW, { snapshot = true } = {}) {
	const build = Promise.withResolvers<BuildResult>();
	const emitted: UpdateStatus[] = [];
	const deps = {
		built: BUILT as string | undefined,
		requestsPath: "/nonexistent/requests.ndjson",
		statePath: "/nonexistent/state.json",
		emit: (status: UpdateStatus) => emitted.push(status),
		check: vi.fn(async () => check),
		build: vi.fn((_onLog: (tail: string) => void) => build.promise),
		relaunch: vi.fn(),
		previous: vi.fn(async (): Promise<PreviousBuild | null> => null),
		restore: vi.fn(async (_previous: PreviousBuild) => undefined),
		now: () => Date.now(),
	};
	const updater = new AppUpdater(deps);
	if (snapshot) updater.updateSnapshot(office());
	const request = (fields: Record<string, unknown> = {}) =>
		JSON.stringify({
			v: 1,
			id: crypto.randomUUID(),
			fromPane: "w1:p1",
			reason: "new TV channels",
			requestedAt: new Date(Date.now()).toISOString(),
			...fields,
		});
	return { updater, deps, build, emitted, request };
}

describe("AppUpdater", () => {
	it("names the requester of a request read before the first snapshot", async () => {
		const { updater, deps, request } = setup(NEW, { snapshot: false });
		await updater.receive([request()]);
		expect(deps.check).not.toHaveBeenCalled();
		expect(updater.status().state).toBe("idle");
		updater.updateSnapshot(office());
		await vi.waitFor(() =>
			expect(updater.status()).toMatchObject({
				state: "available",
				countdown: { by: "max", reason: "new TV channels" },
			}),
		);
		updater.cancel();
	});

	it("applies an agent's request after the countdown, then relaunches", async () => {
		vi.useFakeTimers();
		const { updater, deps, build, request } = setup();
		await updater.receive([request()]);
		expect(updater.status()).toMatchObject({
			state: "available",
			countdown: { by: "max", reason: "new TV channels" },
		});
		await vi.advanceTimersByTimeAsync(14_000);
		expect(deps.build).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(deps.build).toHaveBeenCalledTimes(1);
		expect(updater.status().state).toBe("building");
		build.resolve({ ok: true });
		await vi.waitFor(() => expect(deps.relaunch).toHaveBeenCalledTimes(1));
	});

	it("does nothing when Jeremy cancels the countdown", async () => {
		vi.useFakeTimers();
		const { updater, deps, request } = setup();
		await updater.receive([request({ fromPane: "w9:p9" })]);
		expect(updater.status()).toMatchObject({ countdown: { by: "someone" } });
		updater.cancel();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(deps.build).not.toHaveBeenCalled();
		expect(updater.status()).not.toHaveProperty("countdown");
	});

	it("holds requests while Jeremy is busy, then counts down 10 s after he is free and applies once", async () => {
		vi.useFakeTimers();
		const { updater, deps, request } = setup();
		updater.setBusy("on a call");
		await updater.receive([request()]);
		await updater.receive([request({ fromPane: "w9:p9", reason: "pool fix" })]);
		expect(updater.status()).toMatchObject({
			held: { by: "someone", reason: "pool fix", extra: 1, busy: "on a call" },
		});
		await vi.advanceTimersByTimeAsync(60_000);
		expect(deps.build).not.toHaveBeenCalled();
		updater.setBusy(null);
		await vi.advanceTimersByTimeAsync(9_999);
		expect(updater.status()).toHaveProperty("held");
		await vi.advanceTimersByTimeAsync(1);
		expect(updater.status()).toMatchObject({ countdown: { by: "someone", extra: 1 } });
		updater.setBusy("typing");
		await vi.advanceTimersByTimeAsync(30_000);
		expect(deps.build).not.toHaveBeenCalled();
		updater.setBusy(null);
		await vi.advanceTimersByTimeAsync(25_000);
		expect(deps.build).toHaveBeenCalledTimes(1);
	});

	it("ignores a request when the running build is already HEAD", async () => {
		const { updater, deps, request } = setup({ head: BUILT, commits: [] });
		await updater.receive([request()]);
		expect(updater.status()).toEqual({ state: "idle", head: BUILT });
		expect(deps.build).not.toHaveBeenCalled();
	});

	it("never starts a second build while one is running", async () => {
		const { updater, deps, build } = setup();
		await updater.check();
		const first = updater.apply("from the HUD");
		await updater.apply("again");
		expect(deps.build).toHaveBeenCalledTimes(1);
		build.resolve({ ok: true });
		await first;
	});

	it("keeps running the old build when the build fails, and allows a retry", async () => {
		const { updater, deps, build } = setup();
		await updater.check();
		const applying = updater.apply();
		build.resolve({ ok: false, error: "the build exited with 1", logTail: "error TS2322" });
		await applying;
		expect(deps.relaunch).not.toHaveBeenCalled();
		expect(updater.status()).toMatchObject({
			state: "failed",
			head: HEAD,
			error: "the build exited with 1",
			logTail: "error TS2322",
		});
		void updater.apply("retry");
		expect(deps.build).toHaveBeenCalledTimes(2);
	});

	it("offers nothing under the dev server", async () => {
		const { updater, deps, request } = setup();
		const dev = new AppUpdater({ ...deps, built: undefined });
		await dev.receive([request()]);
		await dev.apply();
		expect(dev.status()).toEqual({ state: "dev" });
		expect(deps.build).not.toHaveBeenCalled();
		expect(updater.status().state).toBe("idle");
	});
});

describe("rolling back", () => {
	const GOOD = "c".repeat(40);
	const kept: PreviousBuild = { commit: GOOD, subject: "pool turn", dependenciesChanged: false };
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});
	function files() {
		const dir = mkdtempSync(join(tmpdir(), "rollback-"));
		dirs.push(dir);
		return { requestsPath: join(dir, "requests.ndjson"), statePath: join(dir, "app-update.json") };
	}

	it("swaps the kept build back in, relaunches, and keeps agents off the bad build until HEAD moves", async () => {
		const paths = files();
		const bad = setup({ head: BUILT, commits: [] });
		Object.assign(bad.deps, paths);
		bad.deps.previous.mockResolvedValue(kept);
		const updater = new AppUpdater(bad.deps);
		await updater.start();
		expect(await updater.rollback()).toEqual({ ok: true });
		expect(bad.deps.restore).toHaveBeenCalledWith(kept);
		expect(bad.deps.relaunch).toHaveBeenCalledOnce();
		expect(JSON.parse(readFileSync(paths.statePath, "utf8"))).toMatchObject({
			rolledBackFrom: BUILT,
		});
		updater.stop();

		// Relaunched on the good build: HEAD is still the bad one.
		const good = setup({ head: BUILT, commits: [{ sha: BUILT, subject: "broke the panel" }] });
		Object.assign(good.deps, paths, { built: GOOD });
		const after = new AppUpdater(good.deps);
		after.updateSnapshot(office());
		await after.start();
		await vi.waitFor(() =>
			expect(after.status()).toMatchObject({ state: "available", rolledBack: true }),
		);
		await after.receive([good.request()]);
		expect(after.status()).not.toHaveProperty("countdown");

		// A fix lands: agents' requests count down again.
		good.deps.check.mockResolvedValue(NEW);
		await after.check();
		await after.receive([good.request()]);
		expect(after.status()).toMatchObject({ state: "available", countdown: { by: "max" } });
		expect(after.status()).not.toHaveProperty("rolledBack");
		await vi.waitFor(() =>
			expect(JSON.parse(readFileSync(paths.statePath, "utf8"))).not.toHaveProperty(
				"rolledBackFrom",
			),
		);
		after.stop();
	});

	it("refuses when nothing is kept or the dependencies changed since, and touches nothing", async () => {
		const { updater, deps } = setup();
		expect(await updater.rollback()).toMatchObject({ ok: false });
		deps.previous.mockResolvedValue({ ...kept, dependenciesChanged: true });
		expect(await updater.rollback()).toEqual({
			ok: false,
			error: "the dependencies changed since that build, so it can't run here",
		});
		expect(deps.restore).not.toHaveBeenCalled();
		expect(deps.relaunch).not.toHaveBeenCalled();
	});

	it("keeps the current build running when the swap fails", async () => {
		const { updater, deps } = setup();
		deps.previous.mockResolvedValue(kept);
		deps.restore.mockRejectedValue(new Error("EBUSY: out"));
		const before = updater.status();
		expect(await updater.rollback()).toEqual({ ok: false, error: "EBUSY: out" });
		expect(updater.status()).toBe(before);
		expect(deps.relaunch).not.toHaveBeenCalled();
	});
});
