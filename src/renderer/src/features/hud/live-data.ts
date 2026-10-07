import type { CostToday } from "@shared/office-stats";
import { useEffect } from "react";
import { create } from "zustand";

const useCost = create<{ readonly cost: CostToday }>(() => ({
	cost: { state: "unavailable", reason: "waiting for the main process" },
}));

let connected = false;

/** Follow main's cost figures once per page, for every reader (the tile, the Trust Inbox). */
function connect(): void {
	if (connected) return;
	connected = true;
	// A preload that predates the stats API (renderer hot-reloaded ahead of a main restart).
	if (!("stats" in window.office)) {
		useCost.setState({
			cost: { state: "unavailable", reason: "restart the app to load cost tracking" },
		});
		return;
	}
	const { stats } = window.office;
	const set = (cost: CostToday): void => useCost.setState({ cost });
	void stats.costToday().then(set);
	stats.onCostToday(set);
}

/** Today's AI cost, office-wide and per agent, pushed from main. */
export function useCostToday(): CostToday {
	useEffect(connect, []);
	return useCost((state) => state.cost);
}
