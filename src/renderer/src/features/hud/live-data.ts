import type { Roster } from "@shared/company/roster";
import type { CostToday } from "@shared/office-stats";
import { useEffect, useState } from "react";

const NO_COST: CostToday = { state: "unavailable", reason: "waiting for the main process" };

/**
 * Today's AI cost, pushed from main. A preload that predates the stats API
 * (renderer hot-reloaded ahead of a main restart) reads as unavailable.
 */
export function useCostToday(): CostToday {
	const [cost, setCost] = useState<CostToday>(NO_COST);
	useEffect(() => {
		if (!("stats" in window.office)) {
			setCost({ state: "unavailable", reason: "restart the app to load cost tracking" });
			return;
		}
		const { stats } = window.office;
		void stats.costToday().then(setCost);
		return stats.onCostToday(setCost);
	}, []);
	return cost;
}

/** The workforce roster (roles, harnesses), when the main process has one. */
export function useRoster(): Roster | null {
	const [roster, setRoster] = useState<Roster | null>(null);
	useEffect(() => {
		if (!("roster" in window.office)) return;
		const { roster: api } = window.office;
		void api.get().then(setRoster);
		return api.onChange(setRoster);
	}, []);
	return roster;
}
