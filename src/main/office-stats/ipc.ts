import type { Roster } from "@shared/company/roster";
import { IPC } from "@shared/ipc";
import type { StatsActionResult } from "@shared/office-stats";
import { ipcMain } from "electron";
import type { CostTracker } from "./cost-tracker";
import { forget, loadCompanyMemories, memoryProjects, remember } from "./memories";
import { forgetRequestSchema, parseProjectRequest, rememberRequestSchema } from "./memory-requests";
import { markSeenRequestSchema, type SeenDoneStore } from "./seen-done";

export interface OfficeStatsDeps {
	readonly cost: Pick<CostTracker, "current">;
	/** The app's own project; always part of company memory. */
	readonly appRoot: string;
	readonly roster: () => Roster | undefined;
	/** Trust Inbox work the user marked seen. */
	readonly seen: SeenDoneStore;
}

/** `window.office.stats` handlers: AI cost, company memory, seen inbox work. Payloads are untrusted. */
export function registerOfficeStatsIpc(deps: OfficeStatsDeps): void {
	const projects = (): string[] => memoryProjects(deps.roster(), deps.appRoot);
	ipcMain.handle(IPC.statsCostToday, () => deps.cost.current());
	ipcMain.handle(IPC.statsMemories, () => loadCompanyMemories(projects()));
	ipcMain.handle(IPC.statsRemember, (_event, payload: unknown): Promise<StatsActionResult> => {
		const parsed = parseProjectRequest(rememberRequestSchema, payload, projects());
		if (!parsed.ok) return Promise.resolve(parsed);
		const { cwd, text, key } = parsed.request;
		return remember(cwd, text, key);
	});
	ipcMain.handle(IPC.statsForget, (_event, payload: unknown): Promise<StatsActionResult> => {
		const parsed = parseProjectRequest(forgetRequestSchema, payload, projects());
		return parsed.ok ? forget(parsed.request.cwd, parsed.request.key) : Promise.resolve(parsed);
	});
	ipcMain.handle(IPC.statsSeenDone, () => deps.seen.all());
	ipcMain.handle(IPC.statsMarkSeen, (_event, payload: unknown) => {
		const { name, seq } = markSeenRequestSchema.parse(payload);
		return deps.seen.mark(name, seq);
	});
}
