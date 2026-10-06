import type { UpdateStatus } from "@shared/app-update";
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

function setup(check: UpdateCheck = NEW) {
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
		now: () => Date.now(),
	};
	const updater = new AppUpdater(deps);
	updater.updateSnapshot(office());
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
