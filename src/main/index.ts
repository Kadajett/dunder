import { join } from "node:path";
import { type BridgeStatus, IPC } from "@shared/ipc";
import { app, BrowserWindow, Menu } from "electron";
import { createCalisthenics } from "./calisthenics/service";
import { createHerdrApi, type HerdrApi } from "./herdr/api-client";
import { OfficeBridge } from "./herdr/office-bridge";
import { defaultSessionDeps, ensureOfficeServer } from "./herdr/session";
import { registerIpc } from "./ipc";
import { registerModelsIpc } from "./models/ipc";
import { createModels } from "./models/service";
import { createSwitchboardService } from "./switchboard/service";
import { ObservePool } from "./terminal/observe-pool";
import { startObserveSession } from "./terminal/observe-session";
import { createPaneSizeResolver } from "./terminal/pane-size";
import { createPtySizeResolver } from "./terminal/pty-size";
import { TerminalRegistry } from "./terminal/registry";
import { ScreensService } from "./terminal/screens-service";
import { fetchForecast } from "./weather/open-meteo";
import { createWeatherService } from "./weather/weather-service";
import { createWorkforce } from "./workforce/service";

/** Resolves once the office server is up; screens size themselves from its layout. */
const officeApi = Promise.withResolvers<HerdrApi>();
/** Layout size: where a released screen puts the pane back. */
const homeSize = createPaneSizeResolver(officeApi.promise);
const observers = new ObservePool({
	start: startObserveSession,
	resolveSize: createPtySizeResolver(homeSize),
});
const screens = new ScreensService(
	observers,
	new TerminalRegistry({ homeSize, onPaneResized: (paneId) => observers.refresh(paneId) }),
);
/** Upper bound on waiting for screen processes to exit when quitting. */
const SHUTDOWN_TIMEOUT_MS = 2_000;
let bridge: OfficeBridge | undefined;
let status: BridgeStatus = { state: "starting" };
/** Upper bound on one forecast request, headers and body. */
const WEATHER_TIMEOUT_MS = 10_000;
const weather = createWeatherService({
	load: () => fetchForecast(fetch, WEATHER_TIMEOUT_MS),
	onChange: (feed) => broadcast(IPC.weather, feed),
});
const calisthenics = createCalisthenics(app.getPath("userData"), (workout) =>
	broadcast(IPC.calisthenicsWorkout, workout),
);
const switchboard = createSwitchboardService(app.getPath("userData"), (message) =>
	broadcast(IPC.switchboardMessage, message),
);
const workforce = createWorkforce(
	{ userData: app.getPath("userData"), appRoot: app.getAppPath() },
	(roster) => broadcast(IPC.roster, roster),
);
const models = createModels(workforce, (live) => broadcast(IPC.modelsLiveChanged, live));

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
		const api = createHerdrApi(socketPath);
		officeApi.resolve(api);
		void switchboard.start(api);
		bridge = new OfficeBridge(api, {
			snapshot: (snapshot) => {
				calisthenics.update(snapshot);
				switchboard.update(snapshot);
				workforce.handleSnapshot(snapshot);
				models.service.update(snapshot);
				broadcast(IPC.snapshot, snapshot);
			},
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
	registerIpc({
		bridge: () => bridge,
		status: () => status,
		screens,
		weather: weather.latest,
		calisthenics,
		switchboard,
		roster: () => workforce.roster(),
	});
	registerModelsIpc(models.catalog, models.service);
	createWindow();
	void startBridge();
	weather.start();
	calisthenics.start();
	workforce.start().catch((error: unknown) => console.warn("[workforce] not started:", error));
	models.service.start();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	bridge?.stop();
	weather.stop();
	calisthenics.stop();
	switchboard.stop();
	workforce.stop();
	models.service.stop();
	app.quit();
});

let screensStopped = false;
app.on("will-quit", (event) => {
	if (screensStopped) return;
	// Hold the quit until every herdr child has released its pane and exited.
	event.preventDefault();
	const timeout = Promise.withResolvers<void>();
	setTimeout(timeout.resolve, SHUTDOWN_TIMEOUT_MS);
	void Promise.race([screens.shutdown(), timeout.promise]).finally(() => {
		screensStopped = true;
		app.quit();
	});
});
