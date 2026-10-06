import type { WeatherFeed, WeatherReport } from "@shared/tv";

export interface WeatherServiceOptions {
	readonly load: () => Promise<WeatherReport>;
	readonly onChange: (feed: WeatherFeed) => void;
	/** Delay between successful fetches. */
	readonly intervalMs?: number;
	/** Delay before retrying a failed fetch. */
	readonly retryMs?: number;
}

export interface WeatherService {
	start(): void;
	stop(): void;
	latest(): WeatherFeed;
}

const TEN_MINUTES = 10 * 60_000;
const ONE_MINUTE = 60_000;

/**
 * Polls the forecast forever. A failed fetch keeps the last good report (stale
 * weather beats no weather) and retries sooner.
 */
export function createWeatherService(options: WeatherServiceOptions): WeatherService {
	const intervalMs = options.intervalMs ?? TEN_MINUTES;
	const retryMs = options.retryMs ?? ONE_MINUTE;
	let feed: WeatherFeed = { report: null, error: null };
	let timer: NodeJS.Timeout | undefined;
	let running = false;

	async function poll(): Promise<void> {
		let delay = intervalMs;
		try {
			feed = { report: await options.load(), error: null };
		} catch (error) {
			feed = { report: feed.report, error: error instanceof Error ? error.message : String(error) };
			delay = retryMs;
		}
		if (!running) return;
		options.onChange(feed);
		timer = setTimeout(() => void poll(), delay);
	}

	return {
		start() {
			if (running) return;
			running = true;
			void poll();
		},
		stop() {
			running = false;
			clearTimeout(timer);
		},
		latest: () => feed,
	};
}
