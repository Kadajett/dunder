import { create } from "zustand";
import { type ChannelId, parseStoredChannel, stepChannel } from "./channels";

const STORAGE_KEY = "herdr-office.tv.channel";

interface TvState {
	readonly channel: ChannelId;
	/** Epoch ms of the last switch (null until the first), for the channel badge. */
	readonly switchedAt: number | null;
	/** Whether the full-window TV overlay is open. */
	readonly fullscreen: boolean;
	select(channel: ChannelId): void;
	/** Flip `delta` channels forward (negative: back), wrapping. */
	step(delta: number): void;
	setFullscreen(open: boolean): void;
}

/**
 * One TV, two views: the wall set and the fullscreen overlay share this store,
 * so switching in either shows in both. The channel survives restarts.
 */
export const useTv = create<TvState>((set, get) => ({
	channel: parseStoredChannel(globalThis.localStorage?.getItem(STORAGE_KEY) ?? null),
	switchedAt: null,
	fullscreen: false,
	select: (channel) => {
		globalThis.localStorage?.setItem(STORAGE_KEY, channel);
		set({ channel, switchedAt: Date.now() });
	},
	step: (delta) => get().select(stepChannel(get().channel, delta)),
	setFullscreen: (fullscreen) => set({ fullscreen }),
}));
