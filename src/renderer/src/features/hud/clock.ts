export type PartOfDay = "morning" | "afternoon" | "evening" | "night";

/** Morning until noon, afternoon until 17:00, evening until 21:00, then night. */
export function partOfDay(hour: number): PartOfDay {
	if (hour >= 5 && hour < 12) return "morning";
	if (hour >= 12 && hour < 17) return "afternoon";
	if (hour >= 17 && hour < 21) return "evening";
	return "night";
}

export interface ClockLabel {
	/** `13:20`, 24-hour local time. */
	readonly time: string;
	/** `TUESDAY · AFTERNOON`. */
	readonly caption: string;
}

/** The top bar clock for a local instant. */
export function clockLabel(date: Date): ClockLabel {
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
	return {
		time: `${hours}:${minutes}`,
		caption: `${weekday} · ${partOfDay(date.getHours())}`.toUpperCase(),
	};
}
