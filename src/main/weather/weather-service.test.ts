import type { WeatherFeed, WeatherReport } from "@shared/tv";
import { afterEach, expect, it, vi } from "vitest";
import { createWeatherService } from "./weather-service";

afterEach(() => {
	vi.useRealTimers();
});

it("turns a failed fetch into the feed's error (keeping the last report) and retries sooner, never rejecting", async () => {
	vi.useFakeTimers();
	const report: WeatherReport = {
		fetchedAt: 1,
		current: {
			observedAt: "2026-10-07T14:30",
			temperatureF: 61,
			feelsLikeF: 60,
			code: 3,
			windMph: 9,
		},
		days: [],
	};
	const load = vi
		.fn<() => Promise<WeatherReport>>()
		.mockResolvedValueOnce(report)
		.mockRejectedValueOnce(new Error("open-meteo HTTP 503"))
		.mockResolvedValueOnce(report);
	const feeds: WeatherFeed[] = [];
	const service = createWeatherService({
		load,
		onChange: (feed) => feeds.push(feed),
		intervalMs: 600_000,
		retryMs: 60_000,
	});
	service.start();
	await vi.advanceTimersByTimeAsync(0);
	await vi.advanceTimersByTimeAsync(600_000);
	expect(feeds.at(-1)).toEqual({ report, error: "open-meteo HTTP 503" });
	// The retry comes after a minute, not the full ten.
	await vi.advanceTimersByTimeAsync(60_000);
	expect(load).toHaveBeenCalledTimes(3);
	expect(feeds.at(-1)).toEqual({ report, error: null });
	service.stop();
});
