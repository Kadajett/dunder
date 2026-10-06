import type { WeatherFeed } from "@shared/tv";
import type { ActivityItem } from "./activity";
import { type ChannelId, channelBadge } from "./channels";
import { ACTIVITY_ROWS, paintActivity } from "./paint/activity";
import { paintClock } from "./paint/clock";
import { type Pen, paintBadge, paintChrome } from "./paint/kit";
import { paintPulse } from "./paint/pulse";
import { paintStandby, STANDBY_FRAME_MS } from "./paint/standby";
import { paintWeather } from "./paint/weather";
import type { OfficePulse } from "./pulse";
import { QUIP_MS } from "./weather-codes";

/** Everything a channel needs to draw one frame. */
export interface TvInputs {
	readonly pulse: OfficePulse | null;
	readonly weather: WeatherFeed | null;
	readonly activity: readonly ActivityItem[];
}

export interface TvFrame {
	readonly channel: ChannelId;
	readonly inputs: TvInputs;
	readonly now: number;
	readonly showBadge: boolean;
}

/**
 * Identity of what a frame would look like: the TV repaints only when this
 * changes. Every channel shows HH:MM, so the minute is always part of it.
 */
export function frameKey({ channel, inputs, now, showBadge }: TvFrame): string {
	const minute = Math.floor(now / 60_000);
	const head = `${channel}|${showBadge}|${minute}`;
	switch (channel) {
		case "pulse":
			return `${head}|${JSON.stringify(inputs.pulse)}`;
		case "weather": {
			const feed = inputs.weather;
			const quip = Math.floor(now / QUIP_MS);
			return `${head}|${feed?.report?.fetchedAt}|${feed?.error}|${quip}`;
		}
		case "activity":
			return `${head}|${inputs.activity
				.slice(0, ACTIVITY_ROWS)
				.map((item) => item.id)
				.join(",")}`;
		case "clock":
			return `${head}|${Math.floor(now / 1_000)}`;
		case "standby":
			return `${head}|${Math.floor(now / STANDBY_FRAME_MS)}`;
	}
}

const TITLES: Record<Exclude<ChannelId, "standby">, { title: string; accent: string }> = {
	pulse: { title: "OFFICE PULSE", accent: "#4fd18b" },
	weather: { title: "SAN FRANCISCO", accent: "#7fb3e5" },
	activity: { title: "ACTIVITY", accent: "#f0b45a" },
	clock: { title: "WORLD CLOCK", accent: "#c58bd8" },
};

/** Paint one full frame of `channel` onto the TV canvas. */
export function paintFrame(pen: Pen, { channel, inputs, now, showBadge }: TvFrame): void {
	if (channel === "standby") paintStandby(pen, now);
	else {
		const { title, accent } = TITLES[channel];
		paintChrome(pen, title, accent, new Date(now));
		if (channel === "pulse") paintPulse(pen, inputs.pulse);
		else if (channel === "weather") paintWeather(pen, inputs.weather, now);
		else if (channel === "activity") paintActivity(pen, inputs.activity);
		else paintClock(pen, now);
	}
	if (showBadge) paintBadge(pen, channelBadge(channel));
}
