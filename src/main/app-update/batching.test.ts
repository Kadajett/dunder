import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PreviousBuild, UpdateStatus } from "@shared/app-update";
import { sessionSnapshotSchema } from "@shared/herdr/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "./build";
import { AppUpdater } from "./service";

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

/** An updater whose last update applied `appliedAgo` ms before now, with `intervalMinutes` batching. */
async function started(appliedAgo: number | undefined, intervalMinutes?: number) {
	const dir = mkdtempSync(join(tmpdir(), "batching-"));
	dirs.push(dir);
	const paths = {
		requestsPath: join(dir, "requests.ndjson"),
		statePath: join(dir, "app-update.json"),
		settingsPath: join(dir, "update-batching.json"),
	};
	const lastAppliedAt = appliedAgo === undefined ? {} : { lastAppliedAt: Date.now() - appliedAgo };
	writeFileSync(paths.statePath, JSON.stringify({ offset: 0, ...lastAppliedAt }));
	if (intervalMinutes !== undefined)
		writeFileSync(paths.settingsPath, JSON.stringify({ intervalMinutes }));
	const build = Promise.withResolvers<BuildResult>();
	const deps = {
		...paths,
		built: BUILT,
		emit: (_status: UpdateStatus) => undefined,
		check: vi.fn(async () => ({ head: HEAD, commits: [{ sha: HEAD, subject: "TV channels" }] })),
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
});
