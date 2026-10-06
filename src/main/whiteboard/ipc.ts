import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { z } from "zod";
import type { WhiteboardService } from "./service";

/** Shape only: the records themselves are migrated and validated by tldraw's schema in the service. */
const putSchema = z.object({
	companyId: z.string().min(1),
	baseRevision: z.number().int().nonnegative(),
	snapshot: z.object({ store: z.record(z.string(), z.unknown()), schema: z.unknown() }),
});

/** `window.office.whiteboard` handlers. Renderer payloads are untrusted. */
export function registerWhiteboardIpc(whiteboard: WhiteboardService): void {
	ipcMain.handle(IPC.whiteboardGet, () => whiteboard.get());
	ipcMain.handle(IPC.whiteboardPut, (_event, payload: unknown) => {
		const { companyId, baseRevision, snapshot } = putSchema.parse(payload);
		return whiteboard.put({ companyId, baseRevision, snapshot });
	});
}
