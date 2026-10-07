import { IPC } from "@shared/ipc";
import { WHITEBOARD_TEXT_MAX } from "@shared/whiteboard";
import { ipcMain } from "electron";
import { z } from "zod";
import { runBd } from "../beads/bd";
import { parseScene } from "./board-doc";
import { readExcalidrawFont } from "./font-assets";
import { createIdeaBead } from "./idea-bead";
import type { WhiteboardService } from "./service";

const putSchema = z.object({
	companyId: z.string().min(1),
	baseRevision: z.number().int().nonnegative(),
	scene: z.unknown(),
});
const fontAssetSchema = z.string().regex(/^fonts\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+\.woff2$/);

const ideaSchema = z.object({
	text: z.string().trim().min(1).max(WHITEBOARD_TEXT_MAX),
	author: z.string().trim().min(1).max(100),
});

/** `window.office.whiteboard` handlers. Renderer payloads are untrusted. */
export function registerWhiteboardIpc(whiteboard: WhiteboardService, cwd: string): void {
	ipcMain.handle(IPC.whiteboardGet, () => whiteboard.get());
	ipcMain.handle(IPC.whiteboardPut, (_event, payload: unknown) => {
		const { companyId, baseRevision, scene } = putSchema.parse(payload);
		return whiteboard.put({ companyId, baseRevision, scene: parseScene(scene) });
	});
	ipcMain.handle(IPC.whiteboardMakeIdea, async (_event, payload: unknown) => {
		return createIdeaBead(runBd, cwd, ideaSchema.parse(payload));
	});
	ipcMain.handle(IPC.whiteboardFont, (_event, payload: unknown) =>
		readExcalidrawFont(fontAssetSchema.parse(payload)),
	);
}
