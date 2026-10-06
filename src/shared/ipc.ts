import type { AppUpdateApi } from "./app-update";
import type { BrainstormApi } from "./brainstorm";
import type { CalisthenicsApi } from "./calisthenics";
import type { ChiefApi } from "./chief";
import type { CompaniesApi } from "./company/company";
import type { RosterApi } from "./company/roster";
import type { WorkforceApi } from "./company/workforce";
import type { HerdrEvent, SessionSnapshot } from "./herdr/schema";
import type { MailQueueApi } from "./mail-queue";
import type { ModelsApi } from "./models";
import type { OfficeStatsApi } from "./office-stats";
import type { PoolApi } from "./pool";
import type { ScreensApi, Unsubscribe } from "./screens";
import type { StaffApi } from "./staff";
import type { OfficeMessage } from "./switchboard";
import type { TerminalCommand } from "./terminal";
import type { WeatherFeed } from "./tv";
import type { WhiteboardApi } from "./whiteboard";

/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
	getSnapshot: "office:get-snapshot",
	getStatus: "office:get-status",
	snapshot: "office:snapshot",
	event: "office:event",
	status: "office:status",
	/** renderer → main: create this window's screens MessagePort (sent once per page load). */
	screensConnect: "screens:connect",
	/** main → renderer: carries the port; all `ScreenPortMessage`s flow over it. */
	screensPort: "screens:port",
	screensObserve: "screens:observe",
	screensUnobserve: "screens:unobserve",
	terminalOpen: "terminal:open",
	terminalCommand: "terminal:command",
	terminalClose: "terminal:close",
	/** Wall TV: latest SF forecast (invoke) and pushed updates (main → renderer). */
	getWeather: "tv:get-weather",
	weather: "tv:weather",
	/** main → renderer: a workout started. */
	calisthenicsWorkout: "calisthenics:workout",
	calisthenicsActive: "calisthenics:active",
	/** renderer → main: the wall bell was rung. */
	calisthenicsStart: "calisthenics:start",
	/** Agent-to-agent mail: recent history (invoke) and live updates (main → renderer). */
	switchboardRecent: "switchboard:recent",
	switchboardMessage: "switchboard:message",
	/** Undelivered mail per agent (sticky notes): current queue (invoke) and every change (main → renderer). */
	mailQueued: "mail:queued",
	mailQueuedChanged: "mail:queued-changed",
	/** Workforce roster: current roster (invoke) and every change (main → renderer). */
	getRoster: "roster:get",
	roster: "roster:changed",
	/** Agent models: omp catalog and live models (invoke), live changes (main → renderer), switch (invoke). */
	modelsCatalog: "models:catalog",
	modelsLive: "models:live",
	modelsLiveChanged: "models:live-changed",
	modelsSet: "models:set",
	/** Chief of Staff chat: status, history and send (invoke), new/updated messages (main → renderer). */
	chiefStatus: "chief:status",
	chiefHistory: "chief:history",
	chiefSend: "chief:send",
	chiefMessage: "chief:message",
	/** HUD stats: today's AI cost (invoke + main → renderer), company memories and seen inbox work (invoke). */
	statsCostToday: "stats:cost-today",
	statsCostTodayChanged: "stats:cost-today-changed",
	statsMemories: "stats:memories",
	statsSeenDone: "stats:seen-done",
	statsMarkSeen: "stats:mark-seen",
	statsRemember: "stats:remember",
	statsForget: "stats:forget",
	/** Companies (invoke) and every change of the current company (main → renderer). */
	companiesList: "companies:list",
	companiesCurrent: "companies:current",
	companiesChanged: "companies:current-changed",
	companiesSwitch: "companies:switch",
	companiesCreate: "companies:create",
	companiesRename: "companies:rename",
	companiesSaveLayout: "companies:save-layout",
	companiesEnsureWorkspace: "companies:ensure-workspace",
	/** Workforce actions (invoke): hire-dialog defaults, hire, fire, restart. */
	workforceDefaults: "workforce:defaults",
	workforceHire: "workforce:hire",
	workforceFire: "workforce:fire",
	workforceRestart: "workforce:restart",
	/** main → renderer: an `office-staff` request was handled (Activity Feed). */
	staffOutcome: "staff:outcome",
	/** Stable-mode updates: status (invoke), changes (main → renderer), apply and cancel (invoke). */
	updateStatus: "update:status",
	updateChanged: "update:changed",
	updateApply: "update:apply",
	updateCancel: "update:cancel",
	/** Whiteboard: the current company's board (invoke), the editor's save (invoke), every change (main → renderer). */
	whiteboardGet: "whiteboard:get",
	whiteboardPut: "whiteboard:put",
	whiteboardChanged: "whiteboard:changed",
	/** Pool table: state (invoke), every change and ~30 Hz ball frames (main → renderer), Jeremy's actions (invoke). */
	poolGet: "pool:get",
	poolChanged: "pool:changed",
	poolFrame: "pool:frame",
	poolJoin: "pool:join",
	poolLeave: "pool:leave",
	poolViewing: "pool:viewing",
	poolShoot: "pool:shoot",
	/** Brainstorm: the running one (invoke), Jeremy's start/end (invoke), every change (main → renderer). */
	brainstormCurrent: "brainstorm:current",
	brainstormStart: "brainstorm:start",
	brainstormEnd: "brainstorm:end",
	brainstormChanged: "brainstorm:changed",
} as const;

export type BridgeStatus =
	| { readonly state: "starting" }
	| { readonly state: "connected" }
	| { readonly state: "reconnecting" }
	| { readonly state: "error"; readonly message: string };

export interface ObserveMessage {
	readonly subscriberId: string;
	readonly paneId: string;
}

export interface TerminalCommandMessage {
	readonly terminalId: string;
	readonly command: TerminalCommand;
}

/** The API the preload script exposes to the renderer as `window.office`. */
export interface OfficeApi {
	getSnapshot(): Promise<SessionSnapshot | null>;
	getStatus(): Promise<BridgeStatus>;
	onSnapshot(listener: (snapshot: SessionSnapshot) => void): Unsubscribe;
	onEvent(listener: (event: HerdrEvent) => void): Unsubscribe;
	onStatus(listener: (status: BridgeStatus) => void): Unsubscribe;
	getWeather(): Promise<WeatherFeed>;
	onWeather(listener: (feed: WeatherFeed) => void): Unsubscribe;
	readonly screens: ScreensApi;
	readonly calisthenics: CalisthenicsApi;
	readonly switchboard: {
		recent(): Promise<readonly OfficeMessage[]>;
		onMessage(listener: (message: OfficeMessage) => void): Unsubscribe;
	};
	readonly mailQueue: MailQueueApi;
	readonly roster: RosterApi;
	readonly models: ModelsApi;
	readonly chief: ChiefApi;
	readonly stats: OfficeStatsApi;
	readonly companies: CompaniesApi;
	readonly workforce: WorkforceApi;
	readonly staff: StaffApi;
	readonly update: AppUpdateApi;
	readonly whiteboard: WhiteboardApi;
	readonly pool: PoolApi;
	readonly brainstorm: BrainstormApi;
}
