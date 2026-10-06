import type { Desk, Layout } from "./schema";

/** A live herdr agent as the office sees it. */
export interface OfficeAgent {
	/** Unique live herdr agent name, or a stable fallback for unnamed agents. */
	readonly name: string;
	readonly paneId: string;
	readonly workspaceLabel: string | undefined;
}

export interface Seating {
	/** deskId → agent. */
	readonly seats: ReadonlyMap<string, OfficeAgent>;
	/** Live agents without a desk (more agents than free desks). */
	readonly unseated: readonly OfficeAgent[];
}

/** Natural order of herdr pane IDs (`w2:p10` after `w2:p9`), i.e. creation order. */
export function comparePaneIds(a: string, b: string): number {
	return a.localeCompare(b, "en", { numeric: true });
}

/** Mutable working state of one seating pass. */
class Seater {
	readonly seats = new Map<string, OfficeAgent>();
	readonly waiting: OfficeAgent[];

	constructor(agents: readonly OfficeAgent[]) {
		this.waiting = [...agents].sort((a, b) => comparePaneIds(a.paneId, b.paneId));
	}

	seat(desk: Desk, pick: (agent: OfficeAgent) => boolean): void {
		if (this.seats.has(desk.id)) return;
		const agent = this.waiting.find(pick);
		if (!agent) return;
		this.seats.set(desk.id, agent);
		this.waiting.splice(this.waiting.indexOf(agent), 1);
	}
}

/**
 * Seat live agents at desks, deterministically:
 * 1. a desk pinned to an agent name gets that agent;
 * 2. agents fill free desks in the zone bound to their herdr workspace;
 * 3. the rest fill free, unreserved desks outside workspace-bound zones,
 *    agents from unbound workspaces first;
 * 4. anyone left over is unseated.
 * Desks fill in layout order and agents in pane-creation order, so adding an
 * agent never moves the ones already seated.
 */
export function seatAgents(layout: Layout, agents: readonly OfficeAgent[]): Seating {
	const seater = new Seater(agents);
	const zoneLabel = new Map(layout.zones.map((zone) => [zone.id, zone.workspaceLabel]));
	const labelOf = (desk: Desk): string | undefined =>
		desk.zoneId ? zoneLabel.get(desk.zoneId) : undefined;
	const boundLabels = new Set(layout.zones.flatMap((zone) => zone.workspaceLabel ?? []));
	const open = layout.desks.filter((desk) => !desk.reserved);

	for (const desk of layout.desks) seater.seat(desk, (agent) => agent.name === desk.agentName);
	for (const desk of open) {
		const label = labelOf(desk);
		if (label !== undefined) seater.seat(desk, (agent) => agent.workspaceLabel === label);
	}
	const shared = open.filter((desk) => labelOf(desk) === undefined);
	for (const desk of shared)
		seater.seat(desk, (agent) => !boundLabels.has(agent.workspaceLabel ?? ""));
	for (const desk of shared) seater.seat(desk, () => true);
	return { seats: seater.seats, unseated: seater.waiting };
}
