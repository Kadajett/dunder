/** The wall TV's channel line-up, in remote-control order. */
export const TV_CHANNELS = [
	{ id: "pulse", name: "OFFICE PULSE" },
	{ id: "weather", name: "SF WEATHER" },
	{ id: "activity", name: "ACTIVITY" },
	{ id: "clock", name: "WORLD CLOCK" },
	{ id: "shipping", name: "SHIPPING" },
	{ id: "standby", name: "HERDR TV" },
] as const;

export type ChannelId = (typeof TV_CHANNELS)[number]["id"];

/** How long the "CH 2 · SF WEATHER" badge stays up after switching. */
export const BADGE_MS = 3_000;

const DEFAULT_CHANNEL: ChannelId = "pulse";

/** The channel `delta` presses of ▶ (or ◀ for negative) away, wrapping round the line-up. */
export function stepChannel(id: ChannelId, delta: number): ChannelId {
	const count = TV_CHANNELS.length;
	const index = TV_CHANNELS.findIndex((channel) => channel.id === id);
	const next = TV_CHANNELS[(((index + delta) % count) + count) % count];
	return next?.id ?? DEFAULT_CHANNEL;
}

/** Remote-control number key (1-based) to channel, or null when no channel has that number. */
export function channelForKey(key: string): ChannelId | null {
	return /^[1-9]$/.test(key) ? (TV_CHANNELS[Number(key) - 1]?.id ?? null) : null;
}

/** A persisted channel id, or the default when it is missing or no longer exists. */
export function parseStoredChannel(raw: string | null): ChannelId {
	return TV_CHANNELS.find((channel) => channel.id === raw)?.id ?? DEFAULT_CHANNEL;
}

/** On-screen badge text, numbered from 1 like a real remote. */
export function channelBadge(id: ChannelId): string {
	const index = TV_CHANNELS.findIndex((channel) => channel.id === id);
	return `CH ${index + 1} · ${TV_CHANNELS[index]?.name ?? ""}`;
}

/** Whether the badge is still showing `now`; `switchedAt` is null until the first switch. */
export function badgeVisible(switchedAt: number | null, now: number): boolean {
	return switchedAt !== null && now >= switchedAt && now - switchedAt < BADGE_MS;
}
