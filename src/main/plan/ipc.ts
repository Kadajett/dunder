import { homedir } from "node:os";
import { join } from "node:path";
import { IPC } from "@shared/ipc";
import { type DayPlan, planProposalSchema } from "@shared/plan";
import { ipcMain } from "electron";
import type { ChiefService } from "../chief/chief-service";
import type { OfficeBridge } from "../herdr/office-bridge";
import { officePlanDigestPath, officePlanRequestsPath, officePlanResultsPath } from "./requests";
import { PlanService } from "./service";

export interface PlanOptions {
	readonly userData: string;
	readonly chief: Pick<ChiefService, "send" | "status">;
	readonly bridge: () => Pick<OfficeBridge, "latest"> | undefined;
	readonly emit: (plan: DayPlan | null) => void;
}

/** The morning plan, talking to Max through the chief chat and taking `office-plan` requests. */
export function createPlan(options: PlanOptions): PlanService {
	const { chief } = options;
	return new PlanService({
		settingsPath: join(options.userData, "morning-plan.json"),
		plansDir: join(options.userData, "plans"),
		digestPath: officePlanDigestPath(process.env, homedir()),
		requestsPath: officePlanRequestsPath(process.env, homedir()),
		resultsPath: officePlanResultsPath(process.env, homedir()),
		now: Date.now,
		tellChief: async (text) => (await chief.send(text)).state !== "rejected",
		chiefPane: () => {
			const name = chief.status()?.name;
			return options
				.bridge()
				?.latest()
				?.agents.find((agent) => agent.name === name)?.pane_id;
		},
		emit: options.emit,
	});
}

/** `window.office.plan` handlers. An edit from the renderer is untrusted. */
export function registerPlanIpc(plan: PlanService): void {
	ipcMain.handle(IPC.planToday, () => plan.today());
	ipcMain.handle(IPC.planApprove, () => plan.approve());
	ipcMain.handle(IPC.planEdit, (_event, edit: unknown) => {
		const parsed = planProposalSchema.safeParse(edit);
		return parsed.success ? plan.edit(parsed.data) : { ok: false, error: "not a valid plan" };
	});
	ipcMain.handle(IPC.planDiscuss, () => plan.discuss());
}
