import type { Layout } from "@shared/layout/schema";
import { useMemo } from "react";
import type { SeatedAgent } from "../model/office-model";
import { seatPlacement, visitorPlacement } from "../scene/station";
import type { BrainWorld } from "./brain";
import { meetingSpots } from "./meeting-spots";
import { buildNavGrid } from "./nav-grid";
import { findPath } from "./pathfind";
import { chooseSpot, decorSpots } from "./spots";
import { besideDesk, ROOM_CENTER, workoutSpots } from "./workout-spots";

/** Behaviour context per seated agent (by pane): its seat, where it may wander, how to get there. */
export function useWorlds(layout: Layout, seated: readonly SeatedAgent[]): Map<string, BrainWorld> {
	const grid = useMemo(() => buildNavGrid(layout), [layout]);
	const spots = useMemo(() => decorSpots(layout), [layout]);
	return useMemo(() => {
		const worlds = new Map<string, BrainWorld>();
		const gym = workoutSpots(grid, ROOM_CENTER, seated.length);
		const huddle = meetingSpots(grid, layout, seated.length);
		const deskOf = new Map(seated.map(({ desk, agent }) => [agent.name, desk]));
		seated.forEach(({ desk, agent }, index) => {
			const colleagues = seated
				.filter((other) => other.desk.id !== desk.id)
				.map((other) => other.desk);
			const spot = gym[index];
			const standing = huddle[index];
			worlds.set(agent.paneId, {
				seat: seatPlacement(desk),
				workoutSpots: spot ? [spot, besideDesk(desk)] : [besideDesk(desk)],
				meetingSpots: standing ? [standing, besideDesk(desk)] : [besideDesk(desk)],
				pickSpot: (random) => chooseSpot(random, spots, colleagues),
				route: (from, to) => findPath(grid, from, to),
				random: Math.random,
				colleagueSpot: (name) => {
					const colleagueDesk = name === agent.name ? undefined : deskOf.get(name);
					return colleagueDesk ? visitorPlacement(colleagueDesk) : undefined;
				},
			});
		});
		return worlds;
	}, [grid, spots, seated, layout]);
}
