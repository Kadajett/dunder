import { updateBusySchema, WHAT_BROKE_MAX } from "@shared/app-update";
import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { z } from "zod";
import type { AppUpdater } from "./service";

const reasonSchema = z.string().max(500).optional();
/** Blank counts as not said; overlong text is cut, not refused (the rollback matters more). */
const whatBrokeSchema = z
	.string()
	.transform((text) => text.trim().slice(0, WHAT_BROKE_MAX))
	.optional();

/** `window.office.update` handlers. Renderer payloads are untrusted. */
export function registerAppUpdateIpc(updater: AppUpdater): void {
	ipcMain.handle(IPC.updateStatus, () => updater.status());
	ipcMain.handle(IPC.updateApply, (_event, reason: unknown) =>
		updater.apply(reasonSchema.safeParse(reason).data),
	);
	ipcMain.handle(IPC.updateCancel, () => updater.cancel());
	ipcMain.handle(IPC.updateSetBusy, (_event, busy: unknown) => {
		const parsed = updateBusySchema.safeParse(busy);
		// A malformed signal must not hold updates forever: treat it as free.
		updater.setBusy(parsed.success ? parsed.data : null);
	});
	ipcMain.handle(IPC.updatePrevious, () => updater.previous());
	ipcMain.handle(IPC.updateRollback, (_event, whatBroke: unknown) =>
		updater.rollback(whatBrokeSchema.safeParse(whatBroke).data || undefined),
	);
}
