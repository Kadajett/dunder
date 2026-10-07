import type { PoolFrame, PoolView } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { spotsNow, tableSpots } from "./pool-store";
import { viewingSync } from "./viewing";

describe("viewing sync", () => {
	it("tells main Jeremy is at the table only while it is settled in an active window, and only on change", () => {
		const sent: boolean[] = [];
		const sync = viewingSync((viewing) => sent.push(viewing));
		sync({ settled: false, active: true });
		sync({ settled: true, active: true });
		sync({ settled: true, active: true });
		// Alt-tab away: his turns go to the autopilot; back again: they wait for him.
		sync({ settled: true, active: false });
		sync({ settled: true, active: true });
		// Leaving the table view.
		sync({ settled: false, active: true });
		expect(sent).toEqual([false, true, false, true, false]);
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
