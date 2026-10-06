import { IPC } from "@shared/ipc";
import { POCKET_IDS } from "@shared/pool";
import { ipcMain } from "electron";
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
