import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PreviousBuild, UpdateStatus } from "@shared/app-update";
import { sessionSnapshotSchema } from "@shared/herdr/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "./build";
import { AppUpdater } from "./service";
import type { UpdateCheck } from "./status";

const BUILT = "a".repeat(40);
const HEAD = "b".repeat(40);
const HOUR = 3_600_000;

const dirs: string[] = [];
const updaters: AppUpdater[] = [];
afterEach(() => {
	for (const updater of updaters.splice(0)) updater.stop();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	vi.useRealTimers();
});

type Paths = { requestsPath: string; statePath: string; settingsPath: string };

/** Temp files for one office: app-update.json holding `state` (raw text if a string), optional settings. */
function files(state: object | string, intervalMinutes?: number): Paths {
	const dir = mkdtempSync(join(tmpdir(), "batching-"));
	dirs.push(dir);
	const paths = {
		requestsPath: join(dir, "requests.ndjson"),
		statePath: join(dir, "app-update.json"),
		settingsPath: join(dir, "update-batching.json"),
	};
	writeFileSync(paths.statePath, typeof state === "string" ? state : JSON.stringify(state));
	if (intervalMinutes !== undefined)
		writeFileSync(paths.settingsPath, JSON.stringify({ intervalMinutes }));
	return paths;
}

/** An updater whose last update applied `appliedAgo` ms before now, with `intervalMinutes` batching. */
function started(appliedAgo: number | undefined, intervalMinutes?: number) {
	const lastAppliedAt = appliedAgo === undefined ? {} : { lastAppliedAt: Date.now() - appliedAgo };
	return startUpdater(files({ offset: 0, ...lastAppliedAt }, intervalMinutes));
}

const savedState = (paths: Paths) => JSON.parse(readFileSync(paths.statePath, "utf8"));

const AHEAD = { head: HEAD, commits: [{ sha: HEAD, subject: "TV channels" }] };

/** A fresh AppUpdater process on `paths` (a second call on the same paths is a restart), seeing `checkout`. */
async function startUpdater(paths: Paths, checkout: UpdateCheck = AHEAD) {
	const build = Promise.withResolvers<BuildResult>();
	const deps = {
		...paths,
		built: BUILT,
		emit: (_status: UpdateStatus) => undefined,
		check: vi.fn(async () => checkout),
		build: vi.fn((_onLog: (tail: string) => void) => build.promise),
		relaunch: vi.fn(),
		previous: vi.fn(async (): Promise<PreviousBuild | null> => null),
		restore: vi.fn(async (_previous: PreviousBuild) => undefined),
		now: () => Date.now(),
	};
	const updater = new AppUpdater(deps);
	updaters.push(updater);
	updater.updateSnapshot(
		sessionSnapshotSchema.parse({
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
					name: "theo",
				},
			],
		}),
	);
	await updater.start();
	const request = (reason: string) =>
		JSON.stringify({
			v: 1,
			id: crypto.randomUUID(),
			fromPane: "w1:p1",
			reason,
			requestedAt: new Date().toISOString(),
		});
	return { updater, deps, build, paths, request };
}

describe("batched agent updates", () => {
	it("holds agents' requests until 2 h after the last update, then counts down once for all of them", async () => {
		vi.useFakeTimers();
		const { updater, deps, request } = await started(HOUR);
		await updater.receive([request("tv channels")]);
		await updater.receive([request("pool fix")]);
		expect(updater.status()).toMatchObject({
			batched: { by: "theo", reason: "pool fix", extra: 1, nextAt: Date.now() + HOUR },
		});
		await vi.advanceTimersByTimeAsync(HOUR - 1_000);
		expect(updater.status()).not.toHaveProperty("countdown");
		// Just past the window's end (a 30 s check can land on the same tick and re-plan the timer).
		await vi.advanceTimersByTimeAsync(2_000);
		expect(updater.status()).toMatchObject({ countdown: { by: "theo", extra: 1 } });
		await vi.advanceTimersByTimeAsync(15_000);
		expect(deps.build).toHaveBeenCalledTimes(1);
	});

	it("counts down at once without a recent update, or with the interval set to 0", async () => {
		const fresh = await started(undefined);
		await fresh.updater.receive([fresh.request("first")]);
		expect(fresh.updater.status()).toHaveProperty("countdown");
		const off = await started(HOUR, 0);
		await off.updater.receive([off.request("no batching")]);
		expect(off.updater.status()).toHaveProperty("countdown");
		expect(JSON.parse(readFileSync(off.paths.settingsPath, "utf8"))).toEqual({
			intervalMinutes: 0,
		});
	});

	it("restarts the window when an update applies (Jeremy's Apply now included)", async () => {
		const { updater, build, paths } = await started(undefined);
		expect(JSON.parse(readFileSync(paths.settingsPath, "utf8"))).toEqual({ intervalMinutes: 120 });
		const applying = updater.apply("now, by Jeremy");
		build.resolve({ ok: true });
		await applying;
		const state = JSON.parse(readFileSync(paths.statePath, "utf8"));
		expect(Date.now() - state.lastAppliedAt).toBeLessThan(5_000);
	});

	it("keeps a batch through a restart inside the window, and applies it once at the window's end", async () => {
		vi.useFakeTimers();
		const first = await started(HOUR);
		await first.updater.receive([first.request("tv channels")]);
		await first.updater.receive([first.request("pool fix")]);
		const before = first.updater.status();
		first.updater.stop();
		await vi.waitFor(() => expect(savedState(first.paths).pending).toMatchObject({ extra: 1 }));
		const again = await startUpdater(first.paths);
		// The same batch, with the same window end.
		expect(again.updater.status()).toEqual(before);
		await vi.advanceTimersByTimeAsync(HOUR + 2_000 + 15_000);
		expect(again.deps.build).toHaveBeenCalledTimes(1);
	});

	it("keeps a request that lands during a build: it waits again after a failed build, and after the relaunch", async () => {
		const failing = await started(undefined, 0);
		const building = failing.updater.apply("now, by Jeremy");
		await failing.updater.receive([failing.request("the fix on top")]);
		failing.build.resolve({ ok: false, error: "tsc", logTail: "" });
		await building;
		expect(failing.updater.status()).toMatchObject({ countdown: { reason: "the fix on top" } });

		const ok = await started(undefined, 0);
		const relaunching = ok.updater.apply("now, by Jeremy");
		await ok.updater.receive([ok.request("merged mid-build")]);
		ok.build.resolve({ ok: true });
		await relaunching;
		expect(ok.deps.relaunch).toHaveBeenCalledOnce();
		// The relaunched process (a new commit still ahead of it) picks the request up.
		const relaunched = await startUpdater(ok.paths);
		expect(relaunched.updater.status()).toMatchObject({
			countdown: { reason: "merged mid-build" },
		});
	});

	it("drops the kept update on Skip, and once there is nothing left to apply", async () => {
		const skipped = await started(HOUR);
		await skipped.updater.receive([skipped.request("tv channels")]);
		skipped.updater.cancel();
		skipped.updater.stop();
		await vi.waitFor(() => expect(savedState(skipped.paths)).not.toHaveProperty("pending"));
		expect((await startUpdater(skipped.paths)).updater.status()).not.toHaveProperty("batched");

		const done = await started(HOUR);
		await done.updater.receive([done.request("tv channels")]);
		done.updater.stop();
		await vi.waitFor(() => expect(savedState(done.paths)).toHaveProperty("pending"));
		// Meanwhile the checkout went back to the running build: the restart has nothing to apply.
		const idle = await startUpdater(done.paths, { head: BUILT, commits: [] });
		expect(idle.updater.status().state).toBe("idle");
		await vi.waitFor(() => expect(savedState(done.paths)).not.toHaveProperty("pending"));
	});

	it("starts on an empty or corrupt app-update.json (an interrupted write) instead of stopping updates", async () => {
		for (const text of ["", "{ corrupt"]) {
			const { updater, deps, request } = await startUpdater(files(text));
			await updater.receive([request("still works")]);
			expect(deps.check).toHaveBeenCalled();
			expect(updater.status()).toHaveProperty("countdown");
		}
	});
});
