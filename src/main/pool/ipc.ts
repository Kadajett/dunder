import { IPC } from "@shared/ipc";
import { POCKET_IDS } from "@shared/pool";
import { ipcMain, type WebContents } from "electron";
import { z } from "zod";
import type { PoolService } from "./service";

const point = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
const shotSchema = z.strictObject({
	angle: z.number().finite(),
	power: z.number().finite(),
	cue: point.optional(),
	calledPocket: z.enum(POCKET_IDS).optional(),
});

/** `window.office.pool` handlers. Renderer payloads are untrusted; the rules check the rest. */
export function registerPoolIpc(pool: PoolService): void {
	ipcMain.handle(IPC.poolGet, () => pool.view());
	ipcMain.handle(IPC.poolJoin, () => pool.join());
	ipcMain.handle(IPC.poolLeave, () => pool.leave());
	ipcMain.handle(IPC.poolViewing, (_event, payload: unknown) =>
		pool.setViewing(z.boolean().parse(payload)),
	);
	ipcMain.handle(IPC.poolShoot, (_event, payload: unknown) => {
		const { angle, power, cue, calledPocket } = shotSchema.parse(payload);
		return pool.shoot({
			angle,
			power,
			...(cue ? { cue } : {}),
			...(calledPocket ? { calledPocket } : {}),
		});
	});
}

/**
 * A reloaded, crashed or closed page is not in table view: hand Jeremy's pool
 * turns to the autopilot, whatever the page last said.
 */
export function clearPoolViewingWithPage(pool: PoolService, contents: WebContents): void {
	const notViewing = (): void => pool.setViewing(false);
	contents.on("did-start-navigation", (details) => {
		if (details.isMainFrame && !details.isSameDocument) notViewing();
	});
	contents.on("render-process-gone", notViewing);
	contents.on("destroyed", notViewing);
}
