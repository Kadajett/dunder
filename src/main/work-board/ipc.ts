import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { workRequestHandlers } from "./requests";
import type { WorkBoardService } from "./service";

/** `window.office.work` handlers. Payloads are validated before any bd command runs. */
export function registerWorkBoardIpc(board: WorkBoardService): void {
	const handlers = workRequestHandlers(board);
	ipcMain.handle(IPC.workGet, () => board.get());
	ipcMain.handle(IPC.workCreate, (_event, payload: unknown) => handlers.create(payload));
	ipcMain.handle(IPC.workPriority, (_event, payload: unknown) => handlers.setPriority(payload));
	ipcMain.handle(IPC.workMove, (_event, payload: unknown) => handlers.move(payload));
	ipcMain.handle(IPC.workAssign, (_event, payload: unknown) => handlers.assign(payload));
	ipcMain.handle(IPC.workRespond, (_event, payload: unknown) => handlers.respond(payload));
	ipcMain.handle(IPC.workDismiss, (_event, payload: unknown) => handlers.dismiss(payload));
}
