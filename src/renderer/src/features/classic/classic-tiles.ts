import type { Zone } from "@shared/layout/schema";
import { comparePaneIds } from "@shared/layout/seating";
import type { LiveAgent } from "../office/model/live-agents";
import type { OfficeModel } from "../office/model/office-model";

/** One agent's tile in the Classic grid. */
export interface ClassicTile {
	readonly agent: LiveAgent;
	/** Where the agent works: its desk's zone, else its herdr workspace. */
	readonly room: string;
	readonly seated: boolean;
}

/**
 * Tiles for every live agent, one per pane: seated agents first in desk
 * (layout) order, then the rest in pane-creation order.
 */
export function classicTiles(model: OfficeModel, zones: readonly Zone[]): ClassicTile[] {
	const zoneTitle = new Map(zones.map((zone) => [zone.id, zone.title]));
	const tiles: ClassicTile[] = [];
	const seen = new Set<string>();
	for (const { desk, agent } of model.seated) {
		if (seen.has(agent.paneId)) continue;
		seen.add(agent.paneId);
		const zone = desk.zoneId ? zoneTitle.get(desk.zoneId) : undefined;
		tiles.push({ agent, room: zone ?? agent.workspaceLabel ?? "Open floor", seated: true });
	}
	const unseated = model.agents
		.filter((agent) => !seen.has(agent.paneId))
		.sort((a, b) => comparePaneIds(a.paneId, b.paneId));
	for (const agent of unseated) {
		if (seen.has(agent.paneId)) continue;
		seen.add(agent.paneId);
		tiles.push({ agent, room: agent.workspaceLabel ?? "No desk", seated: false });
	}
	return tiles;
}
