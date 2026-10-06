import type { RosterAgent } from "@shared/company/roster";

/**
 * The text appended to a worker's omp system prompt: the shared office
 * protocol, then who this worker is (name, room and role from the roster),
 * then its role brief when the role has one.
 */
export function agentPrompt(protocol: string, agent: RosterAgent, roleBrief?: string): string {
	const role = agent.role.trim();
	const who = role ? `the office's ${role}` : "a member of the office";
	const brief = roleBrief?.trim();
	return [
		protocol.trimEnd(),
		"",
		"## Who you are",
		"",
		`You are ${agent.name}, ${who}, working in the ${agent.workspaceLabel} room.`,
		...(brief ? ["", brief] : []),
		"",
	].join("\n");
}
