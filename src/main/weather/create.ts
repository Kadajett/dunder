import type { WeatherFeed } from "@shared/tv";
import { fetchForecast } from "./open-meteo";
import { createWeatherService, type WeatherService } from "./weather-service";

/** Upper bound on one forecast request, headers and body. */
const WEATHER_TIMEOUT_MS = 10_000;

/** The TV's weather: Open-Meteo's forecast, refetched on its schedule. */
export function createWeather(onChange: (feed: WeatherFeed) => void): WeatherService {
	return createWeatherService({
		load: () => fetchForecast(fetch, WEATHER_TIMEOUT_MS),
		onChange,
	});
}
