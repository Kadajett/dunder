import { join } from "node:path";
import { BrowserWindow, type WebContents } from "electron";
import { guardNavigation } from "./external-links";

/**
 * Dunder's one window: the office page, sandboxed behind the preload.
 * `onPage` hooks per-page cleanups to its web contents.
 */
export function createMainWindow(onPage: (contents: WebContents) => void): void {
	const window = new BrowserWindow({
		width: 1600,
		height: 1000,
		minWidth: 960,
		minHeight: 640,
		title: "Dunder",
		backgroundColor: "#efe6d6",
		show: false,
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	window.once("ready-to-show", () => window.show());
	guardNavigation(window.webContents);
	onPage(window.webContents);
	const devUrl = process.env["ELECTRON_RENDERER_URL"];
	if (devUrl) void window.loadURL(devUrl);
	else void window.loadFile(join(__dirname, "../renderer/index.html"));
}
