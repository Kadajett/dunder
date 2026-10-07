import type { WeatherFeed } from "@shared/tv";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useOfficeSession } from "../../herdr/useOfficeSession";
import { useWork } from "../../work/work-store";
import { type ActivityItem, type ActivityNames, describeEvent, learnNames } from "./activity";
import { officePulse } from "./pulse";
import type { TvInputs } from "./screen";

/** Ticker history kept in memory; only the newest few are on screen. */
const ACTIVITY_HISTORY = 12;

interface FeedState {
	readonly weather: WeatherFeed | null;
	readonly activity: readonly ActivityItem[];
}

/** Weather and the event ticker, shared so every TV view shows the same history. */
const useFeeds = create<FeedState>(() => ({ weather: null, activity: [] }));

let names: ActivityNames = { panes: new Map(), workspaces: new Map() };
let viewers = 0;
let stopFeeds: (() => void) | undefined;

function startFeeds(): () => void {
	const office = window.office;
	let nextId = 0;
	const unsubscribers = [
		office.onWeather((weather) => useFeeds.setState({ weather })),
		office.onEvent((event) => {
			const line = describeEvent(event, names);
			if (!line) return;
			const item = { id: nextId++, at: Date.now(), ...line };
			useFeeds.setState((state) => ({
				activity: [item, ...state.activity].slice(0, ACTIVITY_HISTORY),
			}));
		}),
	];
	void office.getWeather().then((initial) => {
		if (!useFeeds.getState().weather) useFeeds.setState({ weather: initial });
	});
	return () => {
		for (const unsubscribe of unsubscribers) unsubscribe();
	};
}

/** Subscribe while at least one TV view is mounted. */
function retainFeeds(): () => void {
	viewers += 1;
	if (viewers === 1) stopFeeds = startFeeds();
	return () => {
		viewers -= 1;
		if (viewers > 0) return;
		stopFeeds?.();
		stopFeeds = undefined;
	};
}

/** Live data for every channel: herdr snapshot + events, the main-process forecast and the work board. */
export function useTvInputs(): TvInputs {
	const { snapshot } = useOfficeSession();
	const weather = useFeeds((state) => state.weather);
	const activity = useFeeds((state) => state.activity);
	const shipping = useWork((state) =>
		state.board?.state === "ok" ? (state.board.shipping ?? null) : null,
	);

	useEffect(retainFeeds, []);
	useEffect(() => {
		if (snapshot) names = learnNames(names, snapshot);
	}, [snapshot]);

	const pulse = useMemo(() => (snapshot ? officePulse(snapshot) : null), [snapshot]);
	return useMemo(
		() => ({ pulse, weather, activity, shipping }),
		[pulse, weather, activity, shipping],
	);
}
