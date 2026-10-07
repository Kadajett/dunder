import { homedir } from "node:os";
import { join } from "node:path";
import { CHIEF_ROLE } from "@shared/chief";
import { activeAgents } from "@shared/company/roster-ops";
import { type BridgeStatus, IPC } from "@shared/ipc";
import { createLogger } from "@shared/log/logger";
import { app, BrowserWindow, Menu } from "electron";
import { migrateLegacyDirs } from "./app-dirs";
import { registerAppErrorsIpc, watchAppPage } from "./app-errors/ipc";
import { AppErrorsService } from "./app-errors/service";
import { createAppUpdater } from "./app-update/create";
import { registerAppUpdateIpc } from "./app-update/ipc";
import { createBrainstorm } from "./brainstorm/create";
import { registerBrainstormIpc } from "./brainstorm/ipc";
import { createCalisthenics } from "./calisthenics/service";
import { registerChiefIpc } from "./chief/ipc";
import { createChief } from "./chief/service";
import { registerCompaniesIpc } from "./companies/ipc";
import { createCompanies } from "./companies/service";
import { createHerdrApi, type HerdrApi } from "./herdr/api-client";
import { OfficeBridge } from "./herdr/office-bridge";
import { defaultSessionDeps, ensureOfficeServer } from "./herdr/session";
import { registerIpc } from "./ipc";
import { configureMainLogging } from "./logging";
import { MailQueueTracker } from "./mail-queue/tracker";
import { registerModelsIpc } from "./models/ipc";
import { createModels } from "./models/service";
import { CostTracker } from "./office-stats/cost-tracker";
import { registerOfficeStatsIpc } from "./office-stats/ipc";
import { createSeenDoneStore } from "./office-stats/seen-done";
import { createPool } from "./pool/create";
import { clearPoolViewingWithPage, registerPoolIpc } from "./pool/ipc";
import { createStaffDesk } from "./staff-desk/create";
import { createSwitchboardService } from "./switchboard/service";
import { ObservePool } from "./terminal/observe-pool";
import { startObserveSession } from "./terminal/observe-session";
import { createPaneSizeResolver } from "./terminal/pane-size";
import { createPtySizeResolver } from "./terminal/pty-size";
import { TerminalRegistry } from "./terminal/registry";
import { ScreensService } from "./terminal/screens-service";
import { createVoice, registerVoiceIpc } from "./voice/ipc";
import { fetchForecast } from "./weather/open-meteo";
import { createWeatherService } from "./weather/weather-service";
import { createWhatsNew, registerWhatsNewIpc } from "./whats-new/ipc";
import { createWhiteboard } from "./whiteboard/create";
import { registerWhiteboardIpc } from "./whiteboard/ipc";
import { createMainWindow } from "./window";
import { createWorkBoard } from "./work-board/create";
import { registerWorkBoardIpc } from "./work-board/ipc";
import { registerWorkforceIpc } from "./workforce/ipc";
import { createStaffing, createWorkforce } from "./workforce/service";

configureMainLogging(process.env, !app.isPackaged);
// Before anything reads userData or the state dir: carry a herdr office install over.
migrateLegacyDirs({
	appData: app.getPath("appData"),
	userData: app.getPath("userData"),
	env: process.env,
	home: homedir(),
});

/** Resolves once the office server is up; screens size themselves from its layout. */
const officeApi = Promise.withResolvers<HerdrApi>();
/** Layout size: where a released screen puts the pane back. */
const homeSize = createPaneSizeResolver(officeApi.promise);
const observers = new ObservePool({
	start: startObserveSession,
	resolveSize: createPtySizeResolver(homeSize),
});
/** Interactive screens; the pool table asks it whether Jeremy has an agent open. */
const terminals = new TerminalRegistry({
	homeSize,
	onPaneResized: (paneId) => observers.refresh(paneId),
});
const screens = new ScreensService(observers, terminals);
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
/** Undelivered mail per agent, for the sticky notes on their desks. */
const mailQueue = new MailQueueTracker({
	chiefName: () => chief.status()?.name,
	emit: (queue) => broadcast(IPC.mailQueuedChanged, queue),
});
const switchboard = createSwitchboardService(app.getPath("userData"), (message) => {
	broadcast(IPC.switchboardMessage, message);
	mailQueue.switchboard(message);
});
const workforce = createWorkforce(
	{ userData: app.getPath("userData"), appRoot: app.getAppPath() },
	(roster) => broadcast(IPC.roster, roster),
);
const models = createModels(workforce, (live) => broadcast(IPC.modelsLiveChanged, live));
const staffing = createStaffing(workforce, models.catalog);
/** Max's `office-staff` requests: hire, fire, restart, model and list from the shell. */
const staffDesk = createStaffDesk({
	userData: app.getPath("userData"),
	appRoot: app.getAppPath(),
	staffing,
	workforce,
	models: models.service,
	emit: (outcome) => broadcast(IPC.staffOutcome, outcome),
});
const chief = createChief(app.getPath("userData"), {
	roster: () => workforce.roster(),
	modelOf: (name) => models.service.live()[name]?.model,
	emit: (message) => {
		broadcast(IPC.chiefMessage, message);
		mailQueue.chief(message);
	},
});
const aiCost = new CostTracker((cost) => broadcast(IPC.statsCostTodayChanged, cost));
const companies = createCompanies(
	{ userData: app.getPath("userData"), appRoot: app.getAppPath() },
	(company) => {
		broadcast(IPC.companiesChanged, company);
		whiteboard.service
			.companyChanged(company.id)
			.catch((error: unknown) => createLogger("whiteboard").warn("board switch failed", { error }));
	},
);
/** The chief of staff's live name, from the roster. */
function chiefName(): string | undefined {
	const roster = workforce.roster();
	return roster && activeAgents(roster).find((agent) => agent.role === CHIEF_ROLE)?.name;
}
/** The shared whiteboard: Jeremy's Excalidraw editor plus agents' `office-board` notes. */
const whiteboard = createWhiteboard({
	userData: app.getPath("userData"),
	currentCompanyId: () => companies.current().then((company) => company.id),
	chiefName,
	emit: (change) => broadcast(IPC.whiteboardChanged, change),
});
/** Brainstorms at the whiteboard: started from the HUD or by the chief with `office-brainstorm`. */
const brainstorm = createBrainstorm({
	userData: app.getPath("userData"),
	chiefName,
	emit: (current) => broadcast(IPC.brainstormChanged, current),
});
/** Stable mode: notices new commits, rebuilds and relaunches only when asked. */
const appUpdate = createAppUpdater({
	root: app.getAppPath(),
	userData: app.getPath("userData"),
	emit: (update) => broadcast(IPC.updateChanged, update),
	shutdown: () => {
		stopServices();
		return stopScreens();
	},
});
/** The pool table: idle agents play 8-ball with the built-in AI; Jeremy can join from the app. */
const pool = createPool({
	isOpen: (paneId) => terminals.isOpen(paneId),
	inBrainstorm: (name) => brainstorm.service.current()?.agents.includes(name) ?? false,
	emit: (view) => broadcast(IPC.poolChanged, view),
	emitFrame: (frame) => broadcast(IPC.poolFrame, frame),
});
/** The left bar's work board over the app repo's Beads (the repo root in stable mode). */
const workBoard = createWorkBoard(app.getAppPath(), (board) => broadcast(IPC.workChanged, board));
/** Renderer errors Jeremy sees in the Trust Inbox (no devtools needed). */
const appErrors = new AppErrorsService({
	emit: (errors) => broadcast(IPC.appErrorsChanged, errors),
});

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
				chief.update(snapshot);
				aiCost.update(snapshot);
				appUpdate.updateSnapshot(snapshot);
				staffDesk.updateSnapshot(snapshot);
				whiteboard.service.updateSnapshot(snapshot);
				pool.updateSnapshot(snapshot);
				brainstorm.service.updateSnapshot(snapshot);
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
	createMainWindow((contents) => {
		clearPoolViewingWithPage(pool, contents);
		watchAppPage(contents, appErrors);
	});
}

/** Every `window.office` handler, registered once the app is ready. */
function registerHandlers(): void {
	registerIpc({
		bridge: () => bridge,
		status: () => status,
		screens,
		weather: weather.latest,
		calisthenics,
		switchboard,
		roster: () => workforce.roster(),
		mailQueue: () => mailQueue.current(),
	});
	registerModelsIpc(models.catalog, models.service);
	registerChiefIpc(chief);
	registerCompaniesIpc(companies);
	registerWorkforceIpc(staffing, app.getAppPath());
	registerAppUpdateIpc(appUpdate);
	registerWhiteboardIpc(whiteboard.service);
	registerPoolIpc(pool);
	registerBrainstormIpc(brainstorm.service);
	registerWorkBoardIpc(workBoard);
	registerAppErrorsIpc(appErrors);
	registerVoiceIpc(createVoice());
	registerWhatsNewIpc(createWhatsNew({ workBoard, chief }));
	registerOfficeStatsIpc({
		cost: aiCost,
		appRoot: app.getAppPath(),
		roster: () => workforce.roster(),
		seen: createSeenDoneStore(join(app.getPath("userData"), "inbox-seen.json")),
	});
}

app.whenReady().then(() => {
	// The default menu binds Ctrl+R, Ctrl+W and friends, which terminal programs need.
	Menu.setApplicationMenu(null);
	registerHandlers();
	createWindow();
	void startBridge();
	weather.start();
	calisthenics.start();
	workforce
		.start()
		.catch((error: unknown) => createLogger("workforce").warn("not started", { error }));
	models.service.start();
	chief.start();
	void chief.history().then((messages) => mailQueue.chiefHistory(messages));
	aiCost.start();
	void appUpdate.start();
	staffDesk
		.start()
		.catch((error: unknown) => createLogger("staff-desk").warn("not started", { error }));
	whiteboard
		.start()
		.catch((error: unknown) => createLogger("whiteboard").warn("not started", { error }));
	pool.start();
	brainstorm
		.start()
		.catch((error: unknown) => createLogger("brainstorm").warn("not started", { error }));
	workBoard.start();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

/** Stop every in-process service (on quit, and before an update relaunches the app). */
function stopServices(): void {
	bridge?.stop();
	weather.stop();
	calisthenics.stop();
	switchboard.stop();
	workforce.stop();
	models.service.stop();
	chief.stop();
	aiCost.stop();
	appUpdate.stop();
	staffDesk.stop();
	whiteboard.stop();
	pool.stop();
	brainstorm.stop();
	workBoard.stop();
	appErrors.stop();
}

app.on("window-all-closed", () => {
	stopServices();
	app.quit();
});

let screensStopped = false;
/** Wait (bounded) until every herdr child has released its pane and exited. */
function stopScreens(): Promise<void> {
	const timeout = Promise.withResolvers<void>();
	setTimeout(timeout.resolve, SHUTDOWN_TIMEOUT_MS);
	return Promise.race([screens.shutdown(), timeout.promise]).finally(() => {
		screensStopped = true;
	});
}

app.on("will-quit", (event) => {
	if (screensStopped) return;
	// Hold the quit until the screens are released.
	event.preventDefault();
	void stopScreens().finally(() => app.quit());
});
