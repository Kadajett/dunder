import { useCallback, useEffect, useState } from "react";
import { type ChannelId, nextChannel, parseStoredChannel } from "./channels";

const STORAGE_KEY = "herdr-office.tv.channel";

export interface TvChannelState {
	readonly channel: ChannelId;
	/** Epoch ms of the last switch (null until the first), for the channel badge. */
	readonly switchedAt: number | null;
	readonly next: () => void;
}

/** Current channel, remembered across restarts in localStorage. */
export function useTvChannel(): TvChannelState {
	const [channel, setChannel] = useState(() =>
		parseStoredChannel(localStorage.getItem(STORAGE_KEY)),
	);
	const [switchedAt, setSwitchedAt] = useState<number | null>(null);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, channel);
	}, [channel]);

	const next = useCallback(() => {
		setChannel(nextChannel);
		setSwitchedAt(Date.now());
	}, []);

	return { channel, switchedAt, next };
}
