import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StaffOutcome } from "@shared/staff";
import type { ModelService } from "../models/model-service";
import { agentBriefDir } from "../workforce/service";
import type { Staffing } from "../workforce/staffing";
import type { WorkforceSupervisor } from "../workforce/supervisor";
import { StaffDesk } from "./desk";
import { officeStaffRequestsPath, officeStaffResultsPath } from "./requests";

/** Room for hires that do not name one: where the default layout seats the delivery team. */
const DEFAULT_ROOM = "delivery";

export interface StaffDeskOptions {
	readonly userData: string;
	/** Project directory for hires that do not name one (the app checkout). */
	readonly appRoot: string;
	readonly staffing: Staffing;
	readonly workforce: Pick<WorkforceSupervisor, "roster">;
	readonly models: Pick<ModelService, "setModel" | "live">;
	emit(outcome: StaffOutcome): void;
}

/** The chief of staff's `office-staff` desk, wired to the real workforce and model service. */
export function createStaffDesk(options: StaffDeskOptions): StaffDesk {
	const briefDir = agentBriefDir(options.userData);
	return new StaffDesk({
		staffing: options.staffing,
		setModel: (name, selector, thinking) => options.models.setModel(name, selector, thinking),
		roster: () => options.workforce.roster(),
		modelOf: (name) => options.models.live()[name]?.model,
		writeBrief: async (name, brief) => {
			await mkdir(briefDir, { recursive: true });
			await writeFile(join(briefDir, `${name}.md`), `${brief}\n`, "utf8");
		},
		removeBrief: (name) => rm(join(briefDir, `${name}.md`), { force: true }),
		defaults: { room: DEFAULT_ROOM, cwd: options.appRoot },
		requestsPath: officeStaffRequestsPath(process.env, homedir()),
		resultsPath: officeStaffResultsPath(process.env, homedir()),
		statePath: join(options.userData, "staff-desk.json"),
		emit: options.emit,
	});
}
