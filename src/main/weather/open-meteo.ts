import type { WeatherDay, WeatherReport } from "@shared/tv";
import { z } from "zod";

/** Current conditions + 4-day forecast for San Francisco, imperial units, local dates. */
export const SF_FORECAST_URL =
	"https://api.open-meteo.com/v1/forecast?latitude=37.7749&longitude=-122.4194" +
	"&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m" +
	"&daily=weather_code,temperature_2m_max,temperature_2m_min" +
	"&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FLos_Angeles&forecast_days=4";

const forecastSchema = z.object({
	current: z.object({
		time: z.string(),
		temperature_2m: z.number(),
		apparent_temperature: z.number(),
		weather_code: z.number().int(),
		wind_speed_10m: z.number(),
	}),
	daily: z.object({
		time: z.array(z.string()),
		weather_code: z.array(z.number().int()),
		temperature_2m_max: z.array(z.number()),
		temperature_2m_min: z.array(z.number()),
	}),
});

/** Validate an open-meteo forecast response; the daily columns are zipped into days. */
export function parseForecast(json: unknown, fetchedAt: number): WeatherReport {
	const { current, daily } = forecastSchema.parse(json);
	const count = Math.min(
		daily.time.length,
		daily.weather_code.length,
		daily.temperature_2m_max.length,
		daily.temperature_2m_min.length,
	);
	const days: WeatherDay[] = [];
	for (let i = 0; i < count; i++) {
		days.push({
			date: daily.time[i] ?? "",
			code: daily.weather_code[i] ?? 0,
			highF: daily.temperature_2m_max[i] ?? 0,
			lowF: daily.temperature_2m_min[i] ?? 0,
		});
	}
	return {
		fetchedAt,
		current: {
			observedAt: current.time,
			temperatureF: current.temperature_2m,
			feelsLikeF: current.apparent_temperature,
			code: current.weather_code,
			windMph: current.wind_speed_10m,
		},
		days,
	};
}

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/** Fetch and validate the SF forecast; rejects on timeout, HTTP errors or a bad payload. */
export async function fetchForecast(
	fetchImpl: FetchLike,
	timeoutMs: number,
	now: () => number = Date.now,
): Promise<WeatherReport> {
	const response = await fetchImpl(SF_FORECAST_URL, { signal: AbortSignal.timeout(timeoutMs) });
	if (!response.ok) throw new Error(`open-meteo HTTP ${response.status}`);
	return parseForecast(await response.json(), now());
}
