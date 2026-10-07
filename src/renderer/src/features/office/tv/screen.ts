import type { WeatherFeed } from "@shared/tv";
import type { ShippingStats } from "@shared/work-board";
import type { ActivityItem } from "./activity";
import { type ChannelId, channelBadge } from "./channels";
import { ACTIVITY_ROWS, paintActivity } from "./paint/activity";
import { paintClock } from "./paint/clock";
import { type Pen, paintBadge, paintChrome } from "./paint/kit";
import { paintPulse } from "./paint/pulse";
import { paintShipping, paintShippingWall, WALL_PAGE_MS } from "./paint/shipping";
import { paintStandby, STANDBY_FRAME_MS } from "./paint/standby";
import { paintWeather } from "./paint/weather";
import type { OfficePulse } from "./pulse";
import { QUIP_MS } from "./weather-codes";

/** Everything a channel needs to draw one frame. */
export interface TvInputs {
	readonly pulse: OfficePulse | null;
	readonly weather: WeatherFeed | null;
	readonly activity: readonly ActivityItem[];
	/** The work board's throughput figures; null until a board arrives. */
	readonly shipping: ShippingStats | null;
}

export interface TvFrame {
	readonly channel: ChannelId;
	readonly inputs: TvInputs;
	readonly now: number;
	readonly showBadge: boolean;
	/** The wall set (seen small, across the room) rather than the fullscreen overlay. */
	readonly wall: boolean;
}

/**
 * Identity of what a frame would look like: the TV repaints only when this
 * changes. Every channel shows HH:MM, so the minute is always part of it.
 */
export function frameKey({ channel, inputs, now, showBadge, wall }: TvFrame): string {
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
		case "shipping": {
			// On the wall the figures take turns, so the page is part of the picture.
			const page = wall ? Math.floor(now / WALL_PAGE_MS) : 0;
			return `${head}|${page}|${JSON.stringify(inputs.shipping)}`;
		}
		case "standby":
			return `${head}|${Math.floor(now / STANDBY_FRAME_MS)}`;
	}
}

const TITLES: Record<Exclude<ChannelId, "standby">, { title: string; accent: string }> = {
	pulse: { title: "OFFICE PULSE", accent: "#4fd18b" },
	weather: { title: "SAN FRANCISCO", accent: "#7fb3e5" },
	activity: { title: "ACTIVITY", accent: "#f0b45a" },
	clock: { title: "WORLD CLOCK", accent: "#c58bd8" },
	shipping: { title: "SHIPPING", accent: "#6fc3c8" },
};

/** Paint one full frame of `channel` onto the TV canvas. */
export function paintFrame(pen: Pen, { channel, inputs, now, showBadge, wall }: TvFrame): void {
	if (channel === "standby") paintStandby(pen, now);
	else {
		const { title, accent } = TITLES[channel];
		paintChrome(pen, title, accent, new Date(now));
		if (channel === "pulse") paintPulse(pen, inputs.pulse);
		else if (channel === "weather") paintWeather(pen, inputs.weather, now);
		else if (channel === "activity") paintActivity(pen, inputs.activity);
		else if (channel === "shipping") paintShippingChannel(pen, inputs.shipping, now, wall);
		else paintClock(pen, now);
	}
	if (showBadge) paintBadge(pen, channelBadge(channel));
}

/** SHIPPING: the figures one at a time on the wall (read across the room), all of them in fullscreen. */
function paintShippingChannel(
	pen: Pen,
	stats: ShippingStats | null,
	now: number,
	wall: boolean,
): void {
	if (wall) paintShippingWall(pen, stats, now);
	else paintShipping(pen, stats);
}
