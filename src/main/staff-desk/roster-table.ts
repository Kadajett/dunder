import type { Roster } from "@shared/company/roster";
import type { SessionSnapshot } from "@shared/herdr/schema";

export interface RosterTableInput {
	readonly roster: Roster;
	readonly snapshot: SessionSnapshot;
	/** The model a live worker runs now (`selector`), when known. */
	readonly modelOf: (name: string) => string | undefined;
}

const HEADER = ["NAME", "ROLE", "HARNESS", "MODEL", "ROOM", "STATUS"] as const;

/** `office-staff list`: the active roster as an aligned plain-text table. */
export function rosterTable({ roster, snapshot, modelOf }: RosterTableInput): string {
	const rows = roster.agents
		.filter((agent) => agent.firedAt === undefined)
		.map((agent) => [
			agent.name,
			agent.role || "-",
			agent.harness,
			modelOf(agent.name) ?? agent.model ?? "default",
			agent.workspaceLabel,
			snapshot.agents.find((live) => live.name === agent.name)?.agent_status ?? "offline",
		]);
	if (rows.length === 0) return "nobody is on the roster";
	const table = [[...HEADER], ...rows];
	const widths = HEADER.map((_, column) =>
		Math.max(...table.map((row) => row[column]?.length ?? 0)),
	);
	return table
		.map((row) =>
			row
				.map((cell, column) => cell.padEnd(widths[column] ?? 0))
				.join("  ")
				.trimEnd(),
		)
		.join("\n");
}
