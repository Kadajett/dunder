import { brainstormTopicSchema } from "@shared/brainstorm";
import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import type { BrainstormService } from "./service";

/** `window.office.brainstorm` handlers; the HUD's start and end are Jeremy's. Payloads are untrusted. */
export function registerBrainstormIpc(brainstorm: BrainstormService): void {
	ipcMain.handle(IPC.brainstormCurrent, () => brainstorm.current());
	ipcMain.handle(IPC.brainstormStart, (_event, topic: unknown) => {
		brainstorm.start(brainstormTopicSchema.parse(topic), "Jeremy");
	});
	ipcMain.handle(IPC.brainstormEnd, () => brainstorm.end());
}
