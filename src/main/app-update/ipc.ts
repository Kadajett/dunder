import { updateBusySchema } from "@shared/app-update";
import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { z } from "zod";
import type { AppUpdater } from "./service";

const reasonSchema = z.string().max(500).optional();

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
}
