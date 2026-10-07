import { IPC } from "@shared/ipc";
import { ipcMain } from "electron";
import { z } from "zod";
import type { CompaniesService } from "./service";

/** Shapes only; the service validates names, subtitles, settings and layouts. */
const textSchema = z.string();
const createSchema = z.object({ name: textSchema, subtitle: textSchema });
const settingsSchema = z.object({ id: textSchema, settings: z.unknown() });

/** `window.office.companies` handlers. Renderer payloads are untrusted. */
export function registerCompaniesIpc(companies: CompaniesService): void {
	ipcMain.handle(IPC.companiesList, () => companies.list());
	ipcMain.handle(IPC.companiesCurrent, () => companies.current());
	ipcMain.handle(IPC.companiesSwitch, (_event, id: unknown) =>
		companies.switchTo(textSchema.parse(id)),
	);
	ipcMain.handle(IPC.companiesCreate, (_event, payload: unknown) => {
		const { name, subtitle } = createSchema.parse(payload);
		return companies.create(name, subtitle);
	});
	ipcMain.handle(IPC.companiesUpdateSettings, (_event, payload: unknown) => {
		const { id, settings } = settingsSchema.parse(payload);
		return companies.updateSettings(id, settings);
	});
	ipcMain.handle(IPC.companiesSaveLayout, (_event, layout: unknown) =>
		companies.saveLayout(layout),
	);
	ipcMain.handle(IPC.companiesEnsureWorkspace, (_event, label: unknown) =>
		companies.ensureWorkspace(textSchema.parse(label)),
	);
}
