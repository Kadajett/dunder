import { describe, expect, it } from "vitest";
import { CATCH_UP_MINUTES, dailyTimeSchema, isDailyDue, localDateKey } from "./schedule";

const at = (hours: number, minutes = 0) => new Date(2026, 9, 6, hours, minutes);

describe("daily workout schedule", () => {
	it("is due from the configured local time onwards", () => {
		expect(isDailyDue(at(14, 59), "15:00", undefined)).toBe(false);
		expect(isDailyDue(at(15, 0), "15:00", undefined)).toBe(true);
		expect(isDailyDue(at(15, 40), "15:00", "2026-10-05")).toBe(true);
	});

	it("runs once per local day", () => {
		expect(isDailyDue(at(15, 5), "15:00", localDateKey(at(9)))).toBe(false);
		expect(localDateKey(at(23, 59))).toBe("2026-10-06");
	});

	it("skips the day rather than starting hours late", () => {
		const lastChance = at(15, CATCH_UP_MINUTES);
		expect(isDailyDue(lastChance, "15:00", undefined)).toBe(true);
		expect(isDailyDue(at(21), "15:00", undefined)).toBe(false);
	});

	it("accepts only 24 h HH:MM times", () => {
		expect(dailyTimeSchema.safeParse("09:30").success).toBe(true);
		expect(dailyTimeSchema.safeParse("24:00").success).toBe(false);
		expect(dailyTimeSchema.safeParse("3pm").success).toBe(false);
	});
});
