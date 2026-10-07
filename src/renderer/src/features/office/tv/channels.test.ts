import { describe, expect, it } from "vitest";
import {
	BADGE_MS,
	badgeVisible,
	type ChannelId,
	channelBadge,
	channelForKey,
	parseStoredChannel,
	stepChannel,
	TV_CHANNELS,
} from "./channels";
import { WALL_PAGE_MS } from "./paint/shipping";
import { frameKey, type TvInputs } from "./screen";

describe("channel line-up", () => {
	it("visits every channel once per lap and wraps to the first", () => {
		const seen = [];
		let channel: ChannelId = TV_CHANNELS[0].id;
		for (let i = 0; i < TV_CHANNELS.length; i++) {
			seen.push(channel);
			channel = stepChannel(channel, 1);
		}
		expect(new Set(seen).size).toBe(6);
		expect(channel).toBe(TV_CHANNELS[0].id);
	});

	it("steps backwards from the first channel to the last, and by more than a lap", () => {
		expect(stepChannel("pulse", -1)).toBe("standby");
		expect(stepChannel("standby", 1)).toBe("pulse");
		expect(stepChannel("pulse", 7)).toBe("weather");
		expect(stepChannel("weather", -7)).toBe("pulse");
	});

	it("maps remote number keys 1–6 to channels and ignores the rest", () => {
		expect(channelForKey("1")).toBe("pulse");
		expect(channelForKey("5")).toBe("shipping");
		expect(channelForKey("6")).toBe("standby");
		expect(channelForKey("7")).toBeNull();
		expect(channelForKey("0")).toBeNull();
		expect(channelForKey("ArrowLeft")).toBeNull();
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
	const inputs: TvInputs = { pulse: null, weather: null, activity: [], shipping: null };
	const at = (channel: "pulse" | "clock" | "standby", now: number, showBadge = false) =>
		frameKey({ channel, inputs, now, showBadge, wall: true });
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
		expect(
			frameKey({ channel: "pulse", inputs: busy, now: minute, showBadge: false, wall: true }),
		).not.toBe(at("pulse", minute));
	});

	it("turns the wall's SHIPPING page every few seconds, while fullscreen shows everything at once", () => {
		const frame = (now: number, wall: boolean) =>
			frameKey({ channel: "shipping", inputs, now, showBadge: false, wall });
		expect(frame(minute, true)).not.toBe(frame(minute + WALL_PAGE_MS, true));
		expect(frame(minute, false)).toBe(frame(minute + WALL_PAGE_MS, false));
	});
});
