import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { CHIEF_ROLE, type ChiefMessage } from "@shared/chief";
import type { Roster } from "@shared/company/roster";
import { activeAgents } from "@shared/company/roster-ops";
import { officeArgs, runHerdr } from "../herdr/cli";
import { ChiefService } from "./chief-service";

export interface ChiefWiring {
	readonly roster: () => Roster | undefined;
	readonly modelOf: (name: string) => string | undefined;
	readonly emit: (message: ChiefMessage) => void;
}

/** The Chief of Staff chat wired to the office session; history lives in `chief-chat.json`. */
export function createChief(userData: string, deps: ChiefWiring): ChiefService {
	return new ChiefService({
		cli: (args, timeoutMs) => runHerdr(officeArgs(args), timeoutMs),
		historyPath: join(userData, "chief-chat.json"),
		chief: () => {
			const roster = deps.roster();
			return roster && activeAgents(roster).find((agent) => agent.role === CHIEF_ROLE);
		},
		modelOf: deps.modelOf,
		emit: deps.emit,
		now: Date.now,
		newId: randomUUID,
	});
}
