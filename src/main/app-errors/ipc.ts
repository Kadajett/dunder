import { appErrorReportSchema } from "@shared/app-errors";
import { IPC } from "@shared/ipc";
import { ipcMain, type WebContents } from "electron";
import { z } from "zod";
import { type AppErrorsService, watchPageErrors } from "./service";

/** `window.office.errors` handlers. Renderer payloads are untrusted. */
export function registerAppErrorsIpc(errors: AppErrorsService): void {
	ipcMain.handle(IPC.appErrorsList, () => errors.list());
	ipcMain.on(IPC.appErrorsReport, (_event, payload: unknown) => {
		const parsed = appErrorReportSchema.safeParse(payload);
		if (parsed.success) errors.report(parsed.data);
	});
	ipcMain.handle(IPC.appErrorsDismiss, (_event, id: unknown) =>
		errors.dismiss(z.string().parse(id)),
	);
	ipcMain.handle(IPC.appErrorsDevtools, (event) => event.sender.openDevTools({ mode: "detach" }));
}

/**
 * Watch the window's page for errors main can see itself (console errors,
 * a crashed renderer), and give it a devtools shortcut: Ctrl+Shift+I and F12,
 * caught before the page sees them, because the office binds every key it can
 * (terminals need them) and Chromium's own shortcut never fires.
 */
export function watchAppPage(contents: WebContents, errors: AppErrorsService): void {
	watchPageErrors(contents, errors);
	contents.on("before-input-event", (event, input) => {
		if (input.type !== "keyDown") return;
		const chord = input.control && input.shift && !input.alt && input.code === "KeyI";
		if (!chord && input.code !== "F12") return;
		event.preventDefault();
		contents.toggleDevTools();
	});
}
