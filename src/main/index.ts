import { join } from "node:path";
import { type BridgeStatus, IPC } from "@shared/ipc";
import { app, BrowserWindow, Menu } from "electron";
import { createHerdrApi } from "./herdr/api-client";
import { OfficeBridge } from "./herdr/office-bridge";
import { defaultSessionDeps, ensureOfficeServer } from "./herdr/session";
import { registerIpc } from "./ipc";
import { TerminalRegistry } from "./terminal/registry";

const terminals = new TerminalRegistry();
let bridge: OfficeBridge | undefined;
let status: BridgeStatus = { state: "starting" };

function broadcast(channel: string, payload: unknown): void {
	for (const window of BrowserWindow.getAllWindows()) {
		if (!window.isDestroyed()) window.webContents.send(channel, payload);
	}
}

function setStatus(next: BridgeStatus): void {
	status = next;
	broadcast(IPC.status, next);
}

async function startBridge(): Promise<void> {
	try {
		const logPath = join(app.getPath("logs"), "office-server.log");
		const socketPath = await ensureOfficeServer(defaultSessionDeps(logPath));
		bridge = new OfficeBridge(createHerdrApi(socketPath), {
			snapshot: (snapshot) => broadcast(IPC.snapshot, snapshot),
			event: (event) => broadcast(IPC.event, event),
			status: setStatus,
		});
		bridge.start();
	} catch (error) {
		setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
	}
}

function createWindow(): void {
	const window = new BrowserWindow({
		width: 1600,
		height: 1000,
		minWidth: 960,
		minHeight: 640,
		title: "herdr office",
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
	const devUrl = process.env["ELECTRON_RENDERER_URL"];
	if (devUrl) void window.loadURL(devUrl);
	else void window.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
	// The default menu binds Ctrl+R, Ctrl+W and friends, which terminal programs need.
	Menu.setApplicationMenu(null);
	registerIpc({ bridge: () => bridge, status: () => status, terminals });
	createWindow();
	void startBridge();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	terminals.closeAll();
	bridge?.stop();
	app.quit();
});
