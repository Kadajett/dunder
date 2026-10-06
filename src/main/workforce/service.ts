import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CHIEF_NAME, CHIEF_ROLE, CHIEF_WORKSPACE } from "@shared/chief";
import type { Roster } from "@shared/company/roster";
import { officeArgs, runHerdr } from "../herdr/cli";
import type { ModelCatalog } from "../models/catalog";
import { ARCHETYPE_ROLES, fileSeedSource } from "./seed";
import { Staffing } from "./staffing";
import { WorkforceSupervisor } from "./supervisor";

export interface WorkforcePaths {
	/** App data: `roster.json` and the per-worker prompts live here. */
	readonly userData: string;
	/** App root: `bin/` (office CLI for agents' PATH) and `docs/agents/` (protocol, role briefs). */
	readonly appRoot: string;
}

/** Per-worker extra briefs (`office-staff hire --brief`), read at every spawn. */
export function agentBriefDir(userData: string): string {
	return join(userData, "agent-briefs");
}

/** The workforce supervisor wired to the real office session. */
export function createWorkforce(
	paths: WorkforcePaths,
	onChange: (roster: Roster) => void,
): WorkforceSupervisor {
	const path = [join(paths.appRoot, "bin"), process.env["PATH"]].filter(Boolean).join(delimiter);
	const briefs = join(paths.appRoot, "docs", "agents");
	const rolePrompts = Object.fromEntries(
		ARCHETYPE_ROLES.map((role) => [role, join(briefs, "archetypes", `${role}.md`)]),
	);
	return new WorkforceSupervisor({
		rosterPath: join(paths.userData, "roster.json"),
		spawn: {
			promptDir: join(paths.userData, "agent-prompts"),
			protocolPath: join(briefs, "office-protocol.md"),
			paneEnv: { PATH: path },
			rolePrompts: { ...rolePrompts, [CHIEF_ROLE]: join(briefs, "chief-of-staff.md") },
			briefDir: agentBriefDir(paths.userData),
		},
		cli: (args, timeoutMs) => runHerdr(officeArgs(args), timeoutMs),
		sessionExists: existsSync,
		onChange,
		now: Date.now,
		newId: randomUUID,
		chief: {
			name: CHIEF_NAME,
			role: CHIEF_ROLE,
			workspaceLabel: CHIEF_WORKSPACE,
			cwd: paths.appRoot,
		},
		seed: fileSeedSource(paths.userData, homedir()),
	});
}

/** Hire, fire and restart on top of the supervisor, against the real office session. */
export function createStaffing(supervisor: WorkforceSupervisor, catalog: ModelCatalog): Staffing {
	return new Staffing({
		supervisor,
		cli: (args, timeoutMs) => runHerdr(officeArgs(args), timeoutMs),
		catalog: () => catalog.list(),
		isDirectory: (path) =>
			stat(path).then(
				(info) => info.isDirectory(),
				() => false,
			),
		sleep: (ms) => delay(ms),
	});
}
