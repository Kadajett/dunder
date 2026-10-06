import { describe, expect, it } from "vitest";
import { clockLabel, partOfDay } from "./clock";

describe("partOfDay", () => {
	it("switches at noon, 17:00 and 21:00", () => {
		expect(partOfDay(11)).toBe("morning");
		expect(partOfDay(12)).toBe("afternoon");
		expect(partOfDay(16)).toBe("afternoon");
		expect(partOfDay(17)).toBe("evening");
		expect(partOfDay(20)).toBe("evening");
		expect(partOfDay(21)).toBe("night");
	});

	it("keeps the small hours as night until 05:00", () => {
		expect(partOfDay(0)).toBe("night");
		expect(partOfDay(4)).toBe("night");
		expect(partOfDay(5)).toBe("morning");
	});
});

describe("clockLabel", () => {
	it("formats a zero-padded 24-hour time with weekday and part of day", () => {
		// 2026-10-06 is a Tuesday.
		expect(clockLabel(new Date(2026, 9, 6, 13, 20))).toEqual({
			time: "13:20",
			caption: "TUESDAY · AFTERNOON",
		});
		expect(clockLabel(new Date(2026, 9, 6, 7, 5)).time).toBe("07:05");
	});
});
