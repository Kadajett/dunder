import { describe, expect, it } from "vitest";
import {
	BADGE_MS,
	badgeVisible,
	type ChannelId,
	channelBadge,
	nextChannel,
	parseStoredChannel,
	TV_CHANNELS,
} from "./channels";
import { frameKey, type TvInputs } from "./screen";

describe("channel line-up", () => {
	it("visits every channel once per lap and wraps to the first", () => {
		const seen = [];
		let channel: ChannelId = TV_CHANNELS[0].id;
		for (let i = 0; i < TV_CHANNELS.length; i++) {
			seen.push(channel);
			channel = nextChannel(channel);
		}
		expect(new Set(seen).size).toBe(5);
		expect(channel).toBe(TV_CHANNELS[0].id);
	});

	it("restores a stored channel and falls back to the first for junk", () => {
		expect(parseStoredChannel("weather")).toBe("weather");
		expect(parseStoredChannel(null)).toBe("pulse");
		expect(parseStoredChannel("revenue")).toBe("pulse");
	});

	it("numbers badges from 1", () => {
		expect(channelBadge("pulse")).toBe("CH 1 · OFFICE PULSE");
		expect(channelBadge("weather")).toBe("CH 2 · SF WEATHER");
	});

	it("shows the badge only for a few seconds after a switch", () => {
		expect(badgeVisible(null, 1_000)).toBe(false);
		expect(badgeVisible(1_000, 1_000)).toBe(true);
		expect(badgeVisible(1_000, 1_000 + BADGE_MS - 1)).toBe(true);
		expect(badgeVisible(1_000, 1_000 + BADGE_MS)).toBe(false);
	});
});

describe("frameKey", () => {
	const inputs: TvInputs = { pulse: null, weather: null, activity: [] };
	const at = (channel: "pulse" | "clock" | "standby", now: number, showBadge = false) =>
		frameKey({ channel, inputs, now, showBadge });
	const minute = 60_000 * 1_000;

	it("keeps static channels still within a minute and repaints when the minute turns", () => {
		expect(at("pulse", minute + 1_000)).toBe(at("pulse", minute + 59_000));
		expect(at("pulse", minute + 59_000)).not.toBe(at("pulse", minute + 60_000));
	});

	it("ticks the world clock every second and the test card at most 4 times a second", () => {
		expect(at("clock", minute + 1_000)).not.toBe(at("clock", minute + 2_000));
		expect(at("standby", minute)).toBe(at("standby", minute + 249));
		expect(at("standby", minute)).not.toBe(at("standby", minute + 250));
	});

	it("repaints when the badge appears or disappears or the data changes", () => {
		expect(at("pulse", minute, true)).not.toBe(at("pulse", minute, false));
		const busy: TvInputs = {
			...inputs,
			pulse: {
				total: 1,
				byStatus: { working: 1, blocked: 0, done: 0, idle: 0, unknown: 0 },
				workspaces: [],
			},
		};
		expect(frameKey({ channel: "pulse", inputs: busy, now: minute, showBadge: false })).not.toBe(
			at("pulse", minute),
		);
	});
});
