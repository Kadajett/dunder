import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { z } from "zod";
import { parseScene } from "./board-doc";
import type { WhiteboardService } from "./service";

const putSchema = z.object({
	companyId: z.string().min(1),
	baseRevision: z.number().int().nonnegative(),
	scene: z.unknown(),
});

/** `window.office.whiteboard` handlers. Renderer payloads are untrusted. */
export function registerWhiteboardIpc(whiteboard: WhiteboardService): void {
	ipcMain.handle(IPC.whiteboardGet, () => whiteboard.get());
	ipcMain.handle(IPC.whiteboardPut, (_event, payload: unknown) => {
		const { companyId, baseRevision, scene } = putSchema.parse(payload);
		return whiteboard.put({ companyId, baseRevision, scene: parseScene(scene) });
	});
}
