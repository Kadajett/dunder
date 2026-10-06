import type { WeatherFeed } from "@shared/tv";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOfficeSession } from "../../herdr/useOfficeSession";
import { type ActivityItem, type ActivityNames, describeEvent, learnNames } from "./activity";
import { officePulse } from "./pulse";
import type { TvInputs } from "./screen";

/** Ticker history kept in memory; only the newest few are on screen. */
const ACTIVITY_HISTORY = 12;

/** Live data for every channel: herdr snapshot + events and the main-process forecast. */
export function useTvInputs(): TvInputs {
	const { snapshot } = useOfficeSession();
	const [weather, setWeather] = useState<WeatherFeed | null>(null);
	const [activity, setActivity] = useState<readonly ActivityItem[]>([]);
	const names = useRef<ActivityNames>({ panes: new Map(), workspaces: new Map() });

	useEffect(() => {
		if (snapshot) names.current = learnNames(names.current, snapshot);
	}, [snapshot]);

	useEffect(() => {
		const office = window.office;
		let nextId = 0;
		const unsubscribers = [
			office.onWeather(setWeather),
			office.onEvent((event) => {
				const line = describeEvent(event, names.current);
				if (!line) return;
				const item = { id: nextId++, at: Date.now(), ...line };
				setActivity((items) => [item, ...items].slice(0, ACTIVITY_HISTORY));
			}),
		];
		void office.getWeather().then((initial) => setWeather((current) => current ?? initial));
		return () => {
			for (const unsubscribe of unsubscribers) unsubscribe();
		};
	}, []);

	const pulse = useMemo(() => (snapshot ? officePulse(snapshot) : null), [snapshot]);
	return useMemo(() => ({ pulse, weather, activity }), [pulse, weather, activity]);
}
