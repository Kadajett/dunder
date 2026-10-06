/** Sky picture the TV draws for a WMO weather code. */
export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface Conditions {
	readonly sky: Sky;
	readonly label: string;
}

/** Inclusive WMO code ranges, per https://open-meteo.com/en/docs (WMO Weather interpretation codes). */
const WMO_RANGES: readonly (readonly [from: number, to: number, conditions: Conditions])[] = [
	[0, 0, { sky: "clear", label: "Clear" }],
	[1, 1, { sky: "clear", label: "Mostly clear" }],
	[2, 2, { sky: "partly", label: "Partly cloudy" }],
	[3, 3, { sky: "cloudy", label: "Overcast" }],
	[45, 48, { sky: "fog", label: "Fog" }],
	[51, 57, { sky: "drizzle", label: "Drizzle" }],
	[61, 67, { sky: "rain", label: "Rain" }],
	[71, 77, { sky: "snow", label: "Snow" }],
	[80, 82, { sky: "rain", label: "Rain showers" }],
	[85, 86, { sky: "snow", label: "Snow showers" }],
	[95, 99, { sky: "storm", label: "Thunderstorms" }],
];

/** Plain-language conditions for a WMO weather interpretation code (open-meteo `weather_code`). */
export function describeWeather(code: number): Conditions {
	const match = WMO_RANGES.find(([from, to]) => code >= from && code <= to);
	return match?.[2] ?? { sky: "cloudy", label: "Who knows" };
}

const QUIPS: Record<Sky, readonly string[]> = {
	clear: [
		"Clear skies. Karl the Fog is on PTO.",
		"Rare sunshine. Agents report squinting.",
		"Perfect day to ship from Dolores Park.",
	],
	partly: ["A little Karl, a little sun. Classic SF.", "Layers recommended. Always layers."],
	cloudy: ["Grey and cozy: ideal deep-work weather.", "Overcast, the official SF dress code."],
	fog: [
		"Karl the Fog has clocked in.",
		"Visibility: about one standup.",
		"Golden Gate status: allegedly there.",
	],
	drizzle: ["Not rain. Just the fog committing harder.", "Mist with ambition."],
	rain: ["Actual rain! Keep the agents indoors.", "Expect Muni delays. And umbrellas."],
	snow: ["Snow in SF?! Somebody check the thermometer."],
	storm: ["Thunder over the bay. Save your work."],
};

/** How long each quip stays on screen before the next one. */
export const QUIP_MS = 12_000;

/** An SF-flavoured one-liner for the sky, rotating every `QUIP_MS`. */
export function weatherQuip(sky: Sky, now: number): string {
	const quips = QUIPS[sky];
	return quips[Math.floor(now / QUIP_MS) % quips.length] ?? "";
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

/** Forecast column heading: TODAY for the first day, else the weekday of a YYYY-MM-DD date. */
export function forecastDayLabel(date: string, index: number): string {
	if (index === 0) return "TODAY";
	const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
	return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? date;
}
