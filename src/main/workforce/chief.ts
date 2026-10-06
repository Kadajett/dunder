import type { Roster } from "@shared/company/roster";
import { activeAgents, findByName, hireAgent, updateAgent } from "@shared/company/roster-ops";

/** Who the office's chief of staff is when the roster has none yet. */
export interface ChiefSeed {
	readonly name: string;
	readonly role: string;
	readonly workspaceLabel: string;
	readonly cwd: string;
}

/**
 * Guarantee the roster has a chief without ever creating a second one.
 * Any active agent already in the role counts; a same-named active worker
 * (e.g. adopted as a generalist) is promoted in place; a fired one stays
 * gone, since letting the chief go is Jeremy's call. Returns the same
 * roster object when nothing changes.
 */
export function ensureChief(
	roster: Roster,
	seed: ChiefSeed,
	now: Date,
	newId: () => string,
): Roster {
	if (activeAgents(roster).some((agent) => agent.role === seed.role)) return roster;
	const existing = findByName(roster, seed.name);
	if (existing) {
		if (existing.firedAt !== undefined) return roster;
		return updateAgent(roster, existing.id, { role: seed.role });
	}
	const { name, role, workspaceLabel, cwd } = seed;
	return hireAgent(roster, { name, role, workspaceLabel, cwd }, now, newId());
}
