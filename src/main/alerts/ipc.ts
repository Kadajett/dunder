import { join } from "node:path";
import { IPC } from "@shared/ipc";
import { createLogger } from "@shared/log/logger";
import { app, BrowserWindow, ipcMain, Notification } from "electron";
import { AlertService } from "./service";

const log = createLogger("alerts");

/** The batch's notification; kept referenced so its click handler isn't garbage collected. */
let current: Notification | null = null;
let unsupportedLogged = false;

function showNotification(
	notice: { readonly title: string; readonly body: string },
	onClick: () => void,
): void {
	if (!Notification.isSupported()) {
		if (!unsupportedLogged) log.warn("desktop notifications aren't supported here; chime only");
		unsupportedLogged = true;
		return;
	}
	current?.close();
	// Silent: the renderer's soft chime is the sound, once per batch.
	const notification = new Notification({ title: notice.title, body: notice.body, silent: true });
	notification.on("click", onClick);
	notification.show();
	current = notification;
}

function mainWindow(): BrowserWindow | undefined {
	return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed());
}

/** Needs-you alerts over Electron's notifications and the office window. */
export function createAlerts(): AlertService {
	return new AlertService({
		settingsPath: join(app.getPath("userData"), "alerts.json"),
		now: Date.now,
		isFocused: () => BrowserWindow.getAllWindows().some((window) => window.isFocused()),
		show: showNotification,
		chime: () => mainWindow()?.webContents.send(IPC.alertsChime),
		open: (target) => {
			const window = mainWindow();
			if (!window) return;
			if (window.isMinimized()) window.restore();
			window.show();
			window.focus();
			window.webContents.send(IPC.alertsOpen, target);
		},
	});
}

/** `window.office.alerts` handlers. */
export function registerAlertsIpc(alerts: AlertService): void {
	ipcMain.handle(IPC.alertsMuted, () => alerts.muted());
	ipcMain.handle(IPC.alertsSetMuted, (_event, muted: unknown) => alerts.setMuted(muted === true));
}
