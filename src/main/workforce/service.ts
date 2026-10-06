import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { CHIEF_NAME, CHIEF_ROLE, CHIEF_WORKSPACE } from "@shared/chief";
import type { Roster } from "@shared/company/roster";
import { officeArgs, runHerdr } from "../herdr/cli";
import { WorkforceSupervisor } from "./supervisor";

export interface WorkforcePaths {
	/** App data: `roster.json` and the per-worker prompts live here. */
	readonly userData: string;
	/** App root: `bin/` (office CLI for agents' PATH) and `docs/agents/` (protocol, role briefs). */
	readonly appRoot: string;
}

/** The workforce supervisor wired to the real office session. */
export function createWorkforce(
	paths: WorkforcePaths,
	onChange: (roster: Roster) => void,
): WorkforceSupervisor {
	const path = [join(paths.appRoot, "bin"), process.env["PATH"]].filter(Boolean).join(delimiter);
	return new WorkforceSupervisor({
		rosterPath: join(paths.userData, "roster.json"),
		spawn: {
			promptDir: join(paths.userData, "agent-prompts"),
			protocolPath: join(paths.appRoot, "docs", "agents", "office-protocol.md"),
			paneEnv: { PATH: path },
			rolePrompts: { [CHIEF_ROLE]: join(paths.appRoot, "docs", "agents", "chief-of-staff.md") },
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
	});
}
