import { type ChiefSendResult, chiefSendSchema } from "@shared/chief";
import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import type { ChiefService } from "./chief-service";

/** `window.office.chief` handlers. Renderer payloads are untrusted. */
export function registerChiefIpc(chief: ChiefService): void {
	ipcMain.handle(IPC.chiefStatus, () => chief.status());
	ipcMain.handle(IPC.chiefHistory, () => chief.history());
	ipcMain.handle(
		IPC.chiefSend,
		(_event, payload: unknown, call: unknown): Promise<ChiefSendResult> => {
			const parsed = chiefSendSchema.safeParse(payload);
			if (!parsed.success) {
				return Promise.resolve({ state: "rejected", reason: "empty or too long" });
			}
			return chief.send(parsed.data, call === true);
		},
	);
}
