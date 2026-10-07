import { agentNameSchema, harnessSchema } from "@shared/company/roster";
import type { WorkforceResult } from "@shared/company/workforce";
import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import type { Staffing } from "./staffing";

const BAD_NAME: WorkforceResult = { ok: false, error: "invalid agent name" };

/** `window.office.workforce` handlers. Renderer payloads are untrusted. */
export function registerWorkforceIpc(staffing: Staffing, defaultCwd: string): void {
	ipcMain.handle(IPC.workforceDefaults, () => ({ cwd: defaultCwd }));
	ipcMain.handle(IPC.workforceHire, (_event, request: unknown) => staffing.hire(request));
	ipcMain.handle(IPC.workforceCheckHarness, (_event, harness: unknown) =>
		staffing.checkHarness(harnessSchema.parse(harness)),
	);
	ipcMain.handle(IPC.workforceFire, (_event, name: unknown) => {
		const parsed = agentNameSchema.safeParse(name);
		return parsed.success ? staffing.fire(parsed.data) : BAD_NAME;
	});
	ipcMain.handle(IPC.workforceRestart, (_event, name: unknown) => {
		const parsed = agentNameSchema.safeParse(name);
		return parsed.success ? staffing.restart(parsed.data) : BAD_NAME;
	});
}
