/**
 * Data the wall TV needs from the main process. The renderer's CSP blocks the
 * network, so main fetches the San Francisco forecast and pushes it here.
 */

/** One forecast day; `date` is the local calendar date (YYYY-MM-DD, America/Los_Angeles). */
export interface WeatherDay {
	readonly date: string;
	/** WMO weather interpretation code. */
	readonly code: number;
	readonly highF: number;
	readonly lowF: number;
}

export interface WeatherReport {
	/** Epoch ms when main received this report. */
	readonly fetchedAt: number;
	readonly current: {
		/** Local observation time (ISO, no offset), e.g. `2026-10-06T14:30`. */
		readonly observedAt: string;
		readonly temperatureF: number;
		readonly feelsLikeF: number;
		readonly code: number;
		readonly windMph: number;
	};
	/** Today first. */
	readonly days: readonly WeatherDay[];
}

/** Latest forecast plus the most recent failure, if the last fetch failed. */
export interface WeatherFeed {
	readonly report: WeatherReport | null;
	readonly error: string | null;
}
