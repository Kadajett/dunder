export interface City {
	readonly name: string;
	readonly timeZone: string;
}

export const WORLD_CITIES: readonly City[] = [
	{ name: "SAN FRANCISCO", timeZone: "America/Los_Angeles" },
	{ name: "NEW YORK", timeZone: "America/New_York" },
	{ name: "LONDON", timeZone: "Europe/London" },
	{ name: "TOKYO", timeZone: "Asia/Tokyo" },
];

export interface ZonedTime {
	readonly hours: number;
	readonly minutes: number;
	readonly seconds: number;
	/** Short weekday, e.g. `TUE`. */
	readonly weekday: string;
	/** Calendar date `YYYY-MM-DD` in that zone, for "+1 day" badges. */
	readonly date: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
	let formatter = formatters.get(timeZone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			weekday: "short",
		});
		formatters.set(timeZone, formatter);
	}
	return formatter;
}

/** Wall-clock reading of `instant` in an IANA time zone. */
export function zonedTime(instant: Date, timeZone: string): ZonedTime {
	const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
	for (const part of formatterFor(timeZone).formatToParts(instant)) parts[part.type] = part.value;
	return {
		hours: Number(parts.hour ?? 0),
		minutes: Number(parts.minute ?? 0),
		seconds: Number(parts.second ?? 0),
		weekday: (parts.weekday ?? "").toUpperCase(),
		date: `${parts.year}-${parts.month}-${parts.day}`,
	};
}

/** Day offset of `date` relative to `home` (both YYYY-MM-DD): -1, 0 or +1 in practice. */
export function dayOffset(date: string, home: string): number {
	return Math.round((Date.parse(date) - Date.parse(home)) / 86_400_000);
}

/** Daylight band for the little sun/moon icon: 7:00–18:59 counts as day. */
export function isDaytime(time: ZonedTime): boolean {
	return time.hours >= 7 && time.hours < 19;
}
