import { agentNameSchema } from "@shared/company/roster";
import { IPC } from "@shared/ipc";
import type { SetModelResult } from "@shared/models";
import { ipcMain } from "electron";
import { z } from "zod";
import type { ModelCatalog } from "./catalog";
import type { ModelService } from "./model-service";

const setModelSchema = z.object({
	agentName: agentNameSchema,
	selector: z.string().min(1).max(200),
	thinking: z.string().min(1).max(32).optional(),
});

/** `window.office.models` handlers. Renderer payloads are untrusted. */
export function registerModelsIpc(catalog: ModelCatalog, models: ModelService): void {
	ipcMain.handle(IPC.modelsCatalog, () => catalog.list());
	ipcMain.handle(IPC.modelsLive, () => models.live());
	ipcMain.handle(IPC.modelsSet, (_event, payload: unknown): Promise<SetModelResult> => {
		const parsed = setModelSchema.safeParse(payload);
		if (!parsed.success) {
			return Promise.resolve({ state: "rejected", reason: "invalid model request" });
		}
		const { agentName, selector, thinking } = parsed.data;
		return models.setModel(agentName, selector, thinking);
	});
}
