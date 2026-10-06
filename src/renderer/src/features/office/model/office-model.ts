import type { SessionSnapshot } from "@shared/herdr/schema";
import type { Desk, Layout } from "@shared/layout/schema";
import { seatAgents } from "@shared/layout/seating";
import { useMemo } from "react";
import { type LiveAgent, liveAgents } from "./live-agents";

export interface SeatedAgent {
	readonly desk: Desk;
	readonly agent: LiveAgent;
}

export interface OfficeModel {
	readonly agents: readonly LiveAgent[];
	/** Agents with a desk, in layout order. */
	readonly seated: readonly SeatedAgent[];
}

/** Live agents and where they sit: the one model both the scene and the HUD read. */
export function useOfficeModel(layout: Layout, snapshot: SessionSnapshot | null): OfficeModel {
	const agents = useMemo(() => liveAgents(snapshot), [snapshot]);
	const seated = useMemo(() => {
		const { seats } = seatAgents(layout, agents);
		const byPane = new Map(agents.map((agent) => [agent.paneId, agent]));
		return layout.desks.flatMap((desk) => {
			const agent = byPane.get(seats.get(desk.id)?.paneId ?? "");
			return agent ? [{ desk, agent }] : [];
		});
	}, [layout, agents]);
	return { agents, seated };
}
