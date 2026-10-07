import { UPDATE_COUNTDOWN_MS, UPDATE_FREE_MS, type UpdateStatus } from "@shared/app-update";
import { describe, expect, it } from "vitest";
import {
	afterCheck,
	afterFailure,
	afterWait,
	busyChanged,
	nextDeadline,
	requestUpdate,
	withoutCountdown,
} from "./status";

const BUILT = "a".repeat(40);
const HEAD = "b".repeat(40);
const commits = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		sha: `${index}`.padStart(40, "c"),
		subject: `c${index}`,
	}));
const max = { by: "max", reason: "ship it" };
const theo = { by: "theo", reason: "quiet updates" };
const available = afterCheck({ state: "idle", head: BUILT }, BUILT, {
	head: HEAD,
	commits: commits(1),
});

describe("afterCheck", () => {
	it("is idle while HEAD is the running build, and available once it moves", () => {
		const idle: UpdateStatus = { state: "idle", head: BUILT };
		expect(afterCheck(idle, BUILT, { head: BUILT, commits: [] })).toEqual(idle);
		expect(afterCheck(idle, BUILT, { head: HEAD, commits: commits(3) })).toMatchObject({
			state: "available",
			head: HEAD,
			behind: 3,
		});
	});

	it("caps the listed commits but counts them all", () => {
		const idle: UpdateStatus = { state: "idle", head: BUILT };
		const next = afterCheck(idle, BUILT, { head: HEAD, commits: commits(25) });
		expect(next).toMatchObject({ state: "available", behind: 25 });
		expect(next.state === "available" && next.commits).toHaveLength(20);
	});

	it("never disturbs a build or the dev server", () => {
		const building: UpdateStatus = { state: "building", logTail: "vite…" };
		expect(afterCheck(building, BUILT, { head: HEAD, commits: commits(1) })).toBe(building);
		const dev: UpdateStatus = { state: "dev" };
		expect(afterCheck(dev, BUILT, { head: HEAD, commits: commits(1) })).toBe(dev);
	});

	it("keeps a failure for the same HEAD, and offers a newer HEAD again", () => {
		const failed: UpdateStatus = {
			state: "failed",
			head: HEAD,
			commits: commits(1),
			behind: 1,
			error: "the build exited with 1",
			logTail: "boom",
		};
		expect(afterCheck(failed, BUILT, { head: HEAD, commits: commits(1) })).toBe(failed);
		const newer = "d".repeat(40);
		expect(afterCheck(failed, BUILT, { head: newer, commits: commits(2) })).toMatchObject({
			state: "available",
			head: newer,
			behind: 2,
		});
		// The fix was reverted: back on the running build.
		expect(afterCheck(failed, BUILT, { head: BUILT, commits: [] })).toEqual({
			state: "idle",
			head: BUILT,
		});
	});

	it("keeps a pending countdown or hold when more commits land", () => {
		const newer = { head: "e".repeat(40), commits: commits(2) };
		const counting = requestUpdate(available, max, null, 0);
		expect(afterCheck(counting, BUILT, newer)).toMatchObject({
			behind: 2,
			countdown: { by: "max" },
		});
		const held = requestUpdate(available, max, "on a call", 0);
		expect(afterCheck(held, BUILT, newer)).toMatchObject({ behind: 2, held: { by: "max" } });
	});
});

describe("requestUpdate", () => {
	it("counts down when Jeremy is free, only when there is something to apply", () => {
		const idle: UpdateStatus = { state: "idle", head: BUILT };
		expect(requestUpdate(idle, max, null, 0)).toBe(idle);
		expect(requestUpdate(available, max, null, 1_000)).toMatchObject({
			countdown: { ...max, extra: 0, applyAt: 1_000 + UPDATE_COUNTDOWN_MS },
		});
	});

	it("holds while he is busy, and folds later requests into one", () => {
		const held = requestUpdate(available, max, "on a call", 0);
		expect(held).toMatchObject({ held: { ...max, extra: 0, busy: "on a call", startsAt: null } });
		expect(held).not.toHaveProperty("countdown");
		const merged = requestUpdate(requestUpdate(held, theo, "on a call", 5), max, "typing", 9);
		expect(merged).toMatchObject({ held: { ...max, extra: 2, busy: "typing" } });
	});

	it("keeps waiting out his free time when a request lands during it", () => {
		const freeing = busyChanged(requestUpdate(available, max, "typing", 0), null, 1_000);
		expect(requestUpdate(freeing, theo, null, 2_000)).toMatchObject({
			held: { ...theo, extra: 1, busy: null, startsAt: 1_000 + UPDATE_FREE_MS },
		});
	});
});

describe("busy and free", () => {
	it("starts the full countdown 10 s after he is free", () => {
		const held = requestUpdate(available, max, "in a terminal", 0);
		const free = busyChanged(held, null, 1_000);
		expect(nextDeadline(free)).toBe(1_000 + UPDATE_FREE_MS);
		expect(afterWait(free, 1_000 + UPDATE_FREE_MS - 1)).toBe(free);
		const counting = afterWait(free, 1_000 + UPDATE_FREE_MS);
		expect(counting).toMatchObject({
			countdown: { ...max, extra: 0, applyAt: 1_000 + UPDATE_FREE_MS + UPDATE_COUNTDOWN_MS },
		});
		expect(counting).not.toHaveProperty("held");
	});

	it("restarts the free wait if he gets busy again before it ends", () => {
		const free = busyChanged(requestUpdate(available, max, "typing", 0), null, 1_000);
		const busyAgain = busyChanged(free, "typing", 5_000);
		expect(nextDeadline(busyAgain)).toBeNull();
		expect(nextDeadline(busyChanged(busyAgain, null, 8_000))).toBe(8_000 + UPDATE_FREE_MS);
	});

	it("pauses a countdown back to held when he gets busy, and restarts it in full", () => {
		const counting = requestUpdate(available, theo, null, 0);
		const paused = busyChanged(counting, "at the pool table", 12_000);
		expect(paused).toMatchObject({ held: { ...theo, busy: "at the pool table" } });
		expect(paused).not.toHaveProperty("countdown");
		const restarted = afterWait(busyChanged(paused, null, 20_000), 20_000 + UPDATE_FREE_MS);
		expect(restarted).toMatchObject({
			countdown: { applyAt: 20_000 + UPDATE_FREE_MS + UPDATE_COUNTDOWN_MS },
		});
	});

	it("leaves everything else alone", () => {
		expect(busyChanged(available, "typing", 0)).toBe(available);
		const held = requestUpdate(available, max, "typing", 0);
		expect(busyChanged(held, "typing", 1)).toBe(held);
	});
});

describe("skipping and failures", () => {
	it("skips a countdown or a hold", () => {
		expect(withoutCountdown(requestUpdate(available, max, null, 0))).toEqual(available);
		expect(withoutCountdown(requestUpdate(available, max, "typing", 0))).toEqual(available);
	});

	it("records a failed build against the commits it tried, without the countdown", () => {
		const target = requestUpdate(
			afterCheck({ state: "idle", head: BUILT }, BUILT, { head: HEAD, commits: commits(2) }),
			max,
			null,
			0,
		);
		if (target.state !== "available") throw new Error("expected available");
		expect(afterFailure(target, { error: "the build exited with 1", logTail: "x" })).toEqual({
			state: "failed",
			head: HEAD,
			commits: target.commits,
			behind: 2,
			error: "the build exited with 1",
			logTail: "x",
		});
	});
});
