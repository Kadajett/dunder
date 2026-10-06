import { type AvatarStyle, avatarStyleFor } from "@shared/avatar/style";
import type { AgentSession, SessionSnapshot } from "@shared/herdr/schema";
import {
	agentNameSchema,
	type Harness,
	ROSTER_VERSION,
	type Roster,
	type RosterAgent,
} from "./roster";

export const EMPTY_ROSTER: Roster = { version: ROSTER_VERSION, agents: [] };

/** Role given to workers adopted from the live session, who were never formally hired. */
export const ADOPTED_ROLE = "generalist";

export interface NewAgent {
	readonly name: string;
	readonly role: string;
	/** Defaults to omp. */
	readonly harness?: Harness;
	readonly workspaceLabel: string;
	readonly cwd: string;
	readonly model?: string;
	/** Chosen look; defaults to the deterministic style for `name`, snapshotted now. */
	readonly style?: AvatarStyle;
	readonly lastSessionPath?: string;
}

/** Fields that may change after hiring. Identity (id, name, style, createdAt) never does. */
export type RosterPatch = Partial<
	Pick<RosterAgent, "role" | "model" | "workspaceLabel" | "cwd" | "lastSessionPath">
>;

const IMMUTABLE_FIELDS = ["id", "name", "style", "createdAt", "harness"] as const;

export class ImmutableIdentityError extends Error {}

export function findByName(roster: Roster, name: string): RosterAgent | undefined {
	return roster.agents.find((agent) => agent.name === name);
}

/** Workers the supervisor keeps running: everyone not fired. */
export function activeAgents(roster: Roster): RosterAgent[] {
	return roster.agents.filter((agent) => agent.firedAt === undefined);
}

/** Add a worker. Its style is fixed here, once; names are unique for the roster's lifetime. */
export function hireAgent(roster: Roster, input: NewAgent, now: Date, id: string): Roster {
	agentNameSchema.parse(input.name);
	if (findByName(roster, input.name)) throw new Error(`roster already has ${input.name}`);
	const agent: RosterAgent = {
		id,
		name: input.name,
		style: structuredClone(input.style ?? avatarStyleFor(input.name)),
		role: input.role,
		harness: input.harness ?? "omp",
		workspaceLabel: input.workspaceLabel,
		cwd: input.cwd,
		createdAt: now.toISOString(),
	};
	if (input.model !== undefined) agent.model = input.model;
	if (input.lastSessionPath !== undefined) agent.lastSessionPath = input.lastSessionPath;
	return { ...roster, agents: [...roster.agents, agent] };
}

/** Change a worker's mutable fields. Rejects any attempt to rewrite its identity. */
export function updateAgent(roster: Roster, id: string, patch: RosterPatch): Roster {
	for (const field of IMMUTABLE_FIELDS) {
		if (Object.hasOwn(patch, field)) throw new ImmutableIdentityError(`${field} is immutable`);
	}
	if (!roster.agents.some((agent) => agent.id === id)) throw new Error(`no roster agent ${id}`);
	return {
		...roster,
		agents: roster.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
	};
}

/** Let a worker go: it stays on the roster (its name stays taken) but is never respawned. */
export function fireAgent(roster: Roster, id: string, now: Date): Roster {
	return {
		...roster,
		agents: roster.agents.map((agent) =>
			agent.id === id && agent.firedAt === undefined
				? { ...agent, firedAt: now.toISOString() }
				: agent,
		),
	};
}

/** Hire every named live omp agent not on the roster yet (first run: adopt the existing staff). */
export function adoptLiveAgents(
	roster: Roster,
	snapshot: SessionSnapshot,
	now: Date,
	newId: () => string,
): Roster {
	const labels = new Map(snapshot.workspaces.map((ws) => [ws.workspace_id, ws.label]));
	let next = roster;
	for (const live of snapshot.agents) {
		const workspaceLabel = labels.get(live.workspace_id);
		const cwd = live.cwd ?? live.foreground_cwd;
		if (live.agent !== "omp" || !live.name || !workspaceLabel || !cwd) continue;
		if (!agentNameSchema.safeParse(live.name).success || findByName(next, live.name)) continue;
		const session = sessionPathOf(live.agent_session);
		const input: NewAgent = { name: live.name, role: ADOPTED_ROLE, workspaceLabel, cwd };
		next = hireAgent(
			next,
			session === undefined ? input : { ...input, lastSessionPath: session },
			now,
			newId(),
		);
	}
	return next;
}

/** omp resumes from its session file; claude and codex from whatever names their session. */
function sessionPathOf(
	session: AgentSession | undefined,
	harness: Harness = "omp",
): string | undefined {
	if (!session || session.value.length === 0) return undefined;
	return harness !== "omp" || session.kind === "path" ? session.value : undefined;
}

/**
 * Record the session herdr reports for each live roster worker, so a
 * respawn resumes where it left off. Returns the same roster when nothing changed.
 */
export function syncSessions(roster: Roster, snapshot: SessionSnapshot): Roster {
	let changed = false;
	const agents = roster.agents.map((agent) => {
		const live = snapshot.agents.find((a) => a.name === agent.name && a.agent === agent.harness);
		const session = sessionPathOf(live?.agent_session, agent.harness);
		if (session === undefined || session === agent.lastSessionPath) return agent;
		changed = true;
		return { ...agent, lastSessionPath: session };
	});
	return changed ? { ...roster, agents } : roster;
}
