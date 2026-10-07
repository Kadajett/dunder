import { join } from "node:path";
import { COMMIT_MARK, pathsByBead } from "@shared/change-notes.mts";
import { IPC } from "@shared/ipc";
import { tryRateSchema, type WhatsNewResult, whatsNewRateSchema } from "@shared/whats-new";
import { app, ipcMain } from "electron";
import { commitLog, isAncestor, runGit } from "../app-update/git";
import { builtCommit } from "../app-update/relaunch";
import type { ChiefService } from "../chief/chief-service";
import type { WorkBoardService } from "../work-board/service";
import { WhatsNewService } from "./service";

export interface WhatsNewWiring {
	readonly workBoard: WorkBoardService;
	readonly chief: ChiefService;
}

/** The card for the running build, over the app checkout's git history and Beads. */
export function createWhatsNew(wiring: WhatsNewWiring): WhatsNewService {
	const root = app.getAppPath();
	return new WhatsNewService({
		built: builtCommit(),
		statePath: join(app.getPath("userData"), "whats-new.json"),
		git: {
			isAncestor: (from, to) => isAncestor(root, from, to),
			log: (args) => commitLog(root, args),
			paths: async (args) =>
				pathsByBead(
					await runGit(root, ["log", `--format=${COMMIT_MARK}%s`, "--name-only", ...args]),
				),
		},
		details: (ids) => wiring.workBoard.details(ids),
		comment: (id, text) => wiring.workBoard.comment(id, text, "Jeremy"),
		tellChief: (text) => wiring.chief.send(text),
	});
}

/** `window.office.whatsNew` handlers. Renderer payloads are untrusted. */
export function registerWhatsNewIpc(whatsNew: WhatsNewService): void {
	ipcMain.handle(IPC.whatsNewGet, () => whatsNew.get());
	ipcMain.handle(IPC.whatsNewDismiss, () => whatsNew.dismiss());
	ipcMain.handle(IPC.whatsNewRate, (_event, payload: unknown): Promise<WhatsNewResult> => {
		const parsed = whatsNewRateSchema.safeParse(payload);
		if (!parsed.success) return Promise.resolve({ ok: false, reason: "invalid rating" });
		return whatsNew.rate(parsed.data.id, parsed.data.rating, parsed.data.text);
	});
	ipcMain.handle(IPC.whatsNewTries, () => whatsNew.tries());
	ipcMain.handle(IPC.whatsNewRateTry, (_event, payload: unknown): Promise<WhatsNewResult> => {
		const parsed = tryRateSchema.safeParse(payload);
		if (!parsed.success) return Promise.resolve({ ok: false, reason: "invalid rating" });
		return whatsNew.rateTry(parsed.data.id, parsed.data.rating);
	});
}
