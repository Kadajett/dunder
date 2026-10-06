import { agentNameSchema, type Roster } from "@shared/company/roster";
import { IPC } from "@shared/ipc";
import type { MarkSeenResult } from "@shared/office-stats";
import { ipcMain } from "electron";
import { officeArgs, runHerdr } from "../herdr/cli";
import type { CostTracker } from "./cost-tracker";
import { loadMemories } from "./memories";

const MARK_SEEN_TIMEOUT_MS = 5_000;

export interface OfficeStatsDeps {
	readonly cost: Pick<CostTracker, "current">;
	/** Fallback working directory for company memory. */
	readonly appRoot: string;
	readonly roster: () => Roster | undefined;
}

/** Where the office agents work: the most common roster cwd of hired workers, else the app root. */
export function memoriesCwd(roster: Roster | undefined, appRoot: string): string {
	const counts = new Map<string, number>();
	for (const agent of roster?.agents ?? []) {
		if (!agent.firedAt) counts.set(agent.cwd, (counts.get(agent.cwd) ?? 0) + 1);
	}
	let best: [string, number] = [appRoot, 0];
	for (const entry of counts) if (entry[1] > best[1]) best = entry;
	return best[0];
}

async function markSeen(payload: unknown): Promise<MarkSeenResult> {
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

/** `window.office.stats` handlers: today's AI cost, company memory, mark-seen. Payloads are untrusted. */
export function registerOfficeStatsIpc(deps: OfficeStatsDeps): void {
	ipcMain.handle(IPC.statsCostToday, () => deps.cost.current());
	ipcMain.handle(IPC.statsMemories, () => loadMemories(memoriesCwd(deps.roster(), deps.appRoot)));
	ipcMain.handle(IPC.statsMarkSeen, (_event, payload: unknown) => markSeen(payload));
}
