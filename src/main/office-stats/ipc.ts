import { agentNameSchema, type Roster } from "@shared/company/roster";
import { IPC } from "@shared/ipc";
import type { StatsActionResult } from "@shared/office-stats";
import { ipcMain } from "electron";
import { officeArgs, runHerdr } from "../herdr/cli";
import type { CostTracker } from "./cost-tracker";
import { forget, loadCompanyMemories, memoryProjects, remember } from "./memories";
import { forgetRequestSchema, parseProjectRequest, rememberRequestSchema } from "./memory-requests";

const MARK_SEEN_TIMEOUT_MS = 5_000;

export interface OfficeStatsDeps {
	readonly cost: Pick<CostTracker, "current">;
	/** The app's own project; always part of company memory. */
	readonly appRoot: string;
	readonly roster: () => Roster | undefined;
}

async function markSeen(payload: unknown): Promise<StatsActionResult> {
	const name = agentNameSchema.safeParse(payload);
	if (!name.success) return { ok: false, reason: "invalid agent name" };
	try {
		// herdr clears an agent's `done` once its pane is focused.
		await runHerdr(officeArgs(["agent", "focus", name.data]), MARK_SEEN_TIMEOUT_MS);
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

/** `window.office.stats` handlers: AI cost, company memory, mark-seen. Payloads are untrusted. */
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
	ipcMain.handle(IPC.statsMarkSeen, (_event, payload: unknown) => markSeen(payload));
}
