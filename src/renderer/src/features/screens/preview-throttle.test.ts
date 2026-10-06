import { describe, expect, it } from "vitest";
import { PREVIEW_INTERVAL_MS, previewDelay } from "./preview-throttle";

describe("previewDelay", () => {
	it("draws the first copy immediately", () => {
		expect(previewDelay(undefined, 1000)).toBe(0);
	});

	it("waits out the rest of the interval after a recent copy", () => {
		expect(previewDelay(1000, 1100)).toBe(PREVIEW_INTERVAL_MS - 100);
		expect(previewDelay(1000, 1000, 500)).toBe(500);
	});

	it("draws immediately once the interval has passed", () => {
		expect(previewDelay(1000, 1000 + PREVIEW_INTERVAL_MS)).toBe(0);
		expect(previewDelay(1000, 5000)).toBe(0);
	});

	it("never waits longer than one interval, even if the clock steps back", () => {
		expect(previewDelay(5000, 1000)).toBe(PREVIEW_INTERVAL_MS);
	});
});
