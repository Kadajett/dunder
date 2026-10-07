import { describe, expect, it } from "vitest";
import { snoozeUntil, sortSnoozes, withSnooze } from "./snoozes";

const local = (day: number, hour: number, minute = 0) =>
	new Date(2026, 9, day, hour, minute).getTime();

describe("snoozeUntil", () => {
	it("adds an hour or four", () => {
		expect(snoozeUntil("1h", local(7, 14)) - local(7, 14)).toBe(3_600_000);
		expect(snoozeUntil("4h", local(7, 22)) - local(7, 22)).toBe(4 * 3_600_000);
	});

	it("means 9:00 the next morning, across midnight and month ends, and this morning when picked after midnight", () => {
		expect(snoozeUntil("morning", local(7, 23, 30))).toBe(local(8, 9));
		expect(snoozeUntil("morning", local(7, 9, 30))).toBe(local(8, 9));
		expect(snoozeUntil("morning", local(31, 18))).toBe(new Date(2026, 10, 1, 9).getTime());
		// Still up at 1:30: 'tomorrow' is this coming morning.
		expect(snoozeUntil("morning", local(8, 1, 30))).toBe(local(8, 9));
		expect(snoozeUntil("morning", local(8, 5))).toBe(local(9, 9));
	});
});

describe("snoozes against the clock and what is live", () => {
	const live = { blocked: new Set(["ava"]), asks: new Set(["o-1"]) };

	it("keeps running ones, returns the ones whose time is up, and drops ones whose item is gone", () => {
		const snoozes = [
			{ key: "blocked:ava", until: 100 },
			{ key: "ask:o-1", until: 50 },
			{ key: "ask:o-9", until: 500 },
			{ key: "blocked:ben", until: 10 },
		];
		expect(sortSnoozes(snoozes, live, 60)).toEqual({
			kept: [{ key: "blocked:ava", until: 100 }],
			due: [{ key: "ask:o-1", until: 50 }],
		});
	});

	it("drops nothing of a kind it hasn't seen yet", () => {
		const snoozes = [{ key: "ask:o-9", until: 500 }];
		expect(sortSnoozes(snoozes, { blocked: null, asks: null }, 0).kept).toEqual(snoozes);
	});

	it("keeps one snooze per item, the newest", () => {
		const once = withSnooze([{ key: "ask:o-1", until: 50 }], { key: "ask:o-1", until: 90 });
		expect(once).toEqual([{ key: "ask:o-1", until: 90 }]);
	});
});
