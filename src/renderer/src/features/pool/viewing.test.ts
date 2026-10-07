import { type PoolFrame, type PoolView, VIEWING_GRACE_MS } from "@shared/pool";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spotsNow, tableSpots } from "./pool-store";
import { pingViewing } from "./viewing";

describe("viewing pings", () => {
	beforeEach(() => vi.useFakeTimers({ now: 0 }));
	afterEach(() => vi.useRealTimers());

	it("keeps main hearing from an open table view well inside the grace, and says when it closes", () => {
		const sent: [number, boolean][] = [];
		const stop = pingViewing((viewing) => sent.push([Date.now(), viewing]));
		vi.advanceTimersByTime(60_000);
		stop();
		vi.advanceTimersByTime(60_000);
		const times = sent.map(([at]) => at);
		const gaps = times.slice(1).map((at, index) => at - (times[index] ?? 0));
		expect(Math.max(...gaps)).toBeLessThan(VIEWING_GRACE_MS / 2);
		expect(sent.slice(0, -1).every(([, viewing]) => viewing)).toBe(true);
		expect(sent.at(-1)).toEqual([60_000, false]);
	});
});

describe("ball spots", () => {
	const view = (fields: Partial<PoolView>): PoolView =>
		({
			moving: false,
			shot: 3,
			balls: [
				{ id: 0, x: -0.5, y: 0, pocket: null },
				{ id: 9, x: 0.2, y: 0.1, pocket: null },
				{ id: 4, x: 0, y: 0, pocket: "tl" },
			],
			...fields,
		}) as PoolView;
	const frame: PoolFrame = { shot: 4, t: 0.5, balls: [[0, -0.3, 0.05]] };

	it("draws the rolling shot's frame while the balls move, the view's table otherwise", () => {
		expect(spotsNow(view({ moving: true }), frame)).toBe(frame.balls);
		expect(spotsNow(view({ moving: true }), { ...frame, shot: 3 })).toEqual([
			[0, -0.5, 0],
			[9, 0.2, 0.1],
		]);
		expect(spotsNow(view({ moving: false }), frame)).toEqual([
			[0, -0.5, 0],
			[9, 0.2, 0.1],
		]);
	});

	it("makes a table's spots once, so frames after the shot cost nothing", () => {
		const resting = view({});
		expect(tableSpots(resting.balls)).toBe(tableSpots(resting.balls));
		expect(spotsNow(resting, null)).toBe(spotsNow(resting, frame));
	});
});
