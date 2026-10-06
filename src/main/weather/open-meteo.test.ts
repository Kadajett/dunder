import { describe, expect, it } from "vitest";
import { fetchForecast, parseForecast, SF_FORECAST_URL } from "./open-meteo";

/** Trimmed real response from open-meteo (2026-10-06). */
const SAMPLE = {
	latitude: 37.763283,
	longitude: -122.41286,
	timezone: "America/Los_Angeles",
	current_units: { time: "iso8601", temperature_2m: "°F" },
	current: {
		time: "2026-10-06T11:45",
		interval: 900,
		temperature_2m: 75.1,
		apparent_temperature: 78.7,
		weather_code: 0,
		wind_speed_10m: 1.8,
	},
	daily: {
		time: ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
		weather_code: [0, 1, 45, 0],
		temperature_2m_max: [81.8, 75.5, 75.3, 74.6],
		temperature_2m_min: [58.1, 57.2, 56.9, 55.4],
	},
};

describe("parseForecast", () => {
	it("maps current conditions and zips the daily columns into days", () => {
		const report = parseForecast(SAMPLE, 1234);
		expect(report.fetchedAt).toBe(1234);
		expect(report.current).toEqual({
			observedAt: "2026-10-06T11:45",
			temperatureF: 75.1,
			feelsLikeF: 78.7,
			code: 0,
			windMph: 1.8,
		});
		expect(report.days).toHaveLength(4);
		expect(report.days[2]).toEqual({ date: "2026-10-08", code: 45, highF: 75.3, lowF: 56.9 });
	});

	it("stops at the shortest daily column instead of inventing values", () => {
		const ragged = { ...SAMPLE, daily: { ...SAMPLE.daily, temperature_2m_min: [58.1, 57.2] } };
		expect(parseForecast(ragged, 0).days.map((day) => day.date)).toEqual([
			"2026-10-06",
			"2026-10-07",
		]);
	});

	it("rejects payloads missing current conditions or with non-numeric readings", () => {
		expect(() => parseForecast({ daily: SAMPLE.daily }, 0)).toThrow();
		const bad = { ...SAMPLE, current: { ...SAMPLE.current, temperature_2m: "hot" } };
		expect(() => parseForecast(bad, 0)).toThrow();
		expect(() => parseForecast({ error: true, reason: "nope" }, 0)).toThrow();
	});
});

describe("fetchForecast", () => {
	it("requests the SF forecast and parses the body", async () => {
		const urls: string[] = [];
		const report = await fetchForecast(
			async (url) => {
				urls.push(url);
				return new Response(JSON.stringify(SAMPLE));
			},
			1_000,
			() => 99,
		);
		expect(urls).toEqual([SF_FORECAST_URL]);
		expect(report.fetchedAt).toBe(99);
	});

	it("fails on HTTP errors", async () => {
		const failing = async () => new Response("rate limited", { status: 429 });
		await expect(fetchForecast(failing, 1_000)).rejects.toThrow("HTTP 429");
	});
});
