import { describe, expect, it } from "vitest";
import { dayOffset, WORLD_CITIES, zonedTime } from "./world-clock";

const zone = (name: string): string =>
	WORLD_CITIES.find((city) => city.name === name)?.timeZone ?? "UTC";

describe("zonedTime", () => {
	it("reads the same instant in each city, crossing midnight into Tokyo's tomorrow", () => {
		const instant = new Date("2026-01-15T20:00:05Z");
		const sf = zonedTime(instant, zone("SAN FRANCISCO"));
		const tokyo = zonedTime(instant, zone("TOKYO"));
		expect([sf.hours, sf.minutes, sf.seconds, sf.weekday]).toEqual([12, 0, 5, "THU"]);
		expect(zonedTime(instant, zone("NEW YORK")).hours).toBe(15);
		expect(zonedTime(instant, zone("LONDON")).hours).toBe(20);
		expect([tokyo.hours, tokyo.weekday, tokyo.date]).toEqual([5, "FRI", "2026-01-16"]);
		expect(dayOffset(tokyo.date, sf.date)).toBe(1);
	});

	it("follows daylight saving: London is UTC+1 in July", () => {
		const london = zonedTime(new Date("2026-07-01T23:30:00Z"), zone("LONDON"));
		expect([london.hours, london.minutes, london.date]).toEqual([0, 30, "2026-07-02"]);
	});

	it("reports midnight as hour 0, not 24", () => {
		expect(zonedTime(new Date("2026-03-01T00:00:00Z"), "UTC").hours).toBe(0);
	});
});
