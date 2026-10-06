import type { UpdateStatus } from "@shared/app-update";
import { describe, expect, it } from "vitest";
import { afterCheck, afterFailure, withCountdown, withoutCountdown } from "./status";

const BUILT = "a".repeat(40);
const HEAD = "b".repeat(40);
const commits = (count: number) =>
	Array.from({ length: count }, (_, index) => ({
		sha: `${index}`.padStart(40, "c"),
		subject: `c${index}`,
	}));
const countdown = { by: "max", reason: "ship it", applyAt: 1_000 };

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

	it("keeps a pending countdown when more commits land", () => {
		const available = withCountdown(
			afterCheck({ state: "idle", head: BUILT }, BUILT, { head: HEAD, commits: commits(1) }),
			countdown,
		);
		const newer = afterCheck(available, BUILT, { head: "e".repeat(40), commits: commits(2) });
		expect(newer).toMatchObject({ state: "available", behind: 2, countdown });
	});
});

describe("countdowns and failures", () => {
	it("starts a countdown only when there is something to apply", () => {
		const idle: UpdateStatus = { state: "idle", head: BUILT };
		expect(withCountdown(idle, countdown)).toBe(idle);
		const building: UpdateStatus = { state: "building", logTail: "" };
		expect(withCountdown(building, countdown)).toBe(building);
		const available = afterCheck(idle, BUILT, { head: HEAD, commits: commits(1) });
		expect(withCountdown(available, countdown)).toMatchObject({ countdown });
		expect(withoutCountdown(withCountdown(available, countdown))).toEqual(available);
	});

	it("records a failed build against the commits it tried, without the countdown", () => {
		const target = withCountdown(
			afterCheck({ state: "idle", head: BUILT }, BUILT, { head: HEAD, commits: commits(2) }),
			countdown,
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
