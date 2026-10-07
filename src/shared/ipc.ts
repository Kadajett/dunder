import type { AgentsApi } from "./agent-replies";
import type { AlertsApi } from "./alerts";
import type { AppErrorsApi } from "./app-errors";
import type { AppUpdateApi } from "./app-update";
import type { AwayApi } from "./away";
import type { BrainstormApi } from "./brainstorm";
import type { CalisthenicsApi } from "./calisthenics";
import type { ChiefApi } from "./chief";
import type { CompaniesApi } from "./company/company";
import type { RosterApi } from "./company/roster";
import type { WorkforceApi } from "./company/workforce";
import type { HerdrEvent, SessionSnapshot } from "./herdr/schema";
import type { InboxSnoozeApi } from "./inbox-snooze";
import type { MailQueueApi } from "./mail-queue";
import type { ModelsApi } from "./models";
import type { OfficeStatsApi } from "./office-stats";
import type { PlanApi } from "./plan";
import type { PoolApi } from "./pool";
import type { ScreensApi, Unsubscribe } from "./screens";
import type { StaffApi } from "./staff";
import type { OfficeMessage } from "./switchboard";
import type { TerminalCommand } from "./terminal";
import type { WeatherFeed } from "./tv";
import type { VoiceApi } from "./voice";
import type { WhatsNewApi } from "./whats-new";
import type { WhiteboardApi } from "./whiteboard";
import type { WorkBoardApi } from "./work-board";
import type { WorktreesApi } from "./worktrees";

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
	companiesUpdateSettings: "companies:update-settings",
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
	updateSetBusy: "update:set-busy",
	/** The kept previous build (invoke), and rolling back to it (invoke). */
	updatePrevious: "update:previous",
	updateRollback: "update:rollback",
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
	/** Work board: bd-backed cards (invoke), every change (main → renderer), Jeremy's writes (invoke). */
	workGet: "work:get",
	workChanged: "work:changed",
	workCreate: "work:create",
	workPriority: "work:priority",
	workMove: "work:move",
	workAssign: "work:assign",
	workRespond: "work:respond",
	workDismiss: "work:dismiss",
	/** Calls with the chief: ElevenLabs speech to text and text to speech (invoke). */
	voiceAvailable: "voice:available",
	voiceTranscribe: "voice:transcribe",
	voiceSpeak: "voice:speak",
	/** The card after an update: get, rate a bead, dismiss (invoke). */
	whatsNewGet: "whats-new:get",
	whatsNewRate: "whats-new:rate",
	whatsNewDismiss: "whats-new:dismiss",
	/** Needs-you alerts: the mute (invoke), chime and open-the-inbox requests (main → renderer). */
	alertsMuted: "alerts:muted",
	alertsSetMuted: "alerts:set-muted",
	alertsChime: "alerts:chime",
	alertsOpen: "alerts:open",
	/** Trust Inbox snoozes: the list, snooze and unsnooze (invoke), changes (main → renderer). */
	snoozesList: "snoozes:list",
	snoozesSnooze: "snoozes:snooze",
	snoozesUnsnooze: "snoozes:unsnooze",
	snoozesChanged: "snoozes:changed",
	/** Renderer errors: the list (invoke), a report (send), dismiss and open devtools (invoke), changes (main → renderer). */
	appErrorsList: "app-errors:list",
	appErrorsReport: "app-errors:report",
	appErrorsDismiss: "app-errors:dismiss",
	appErrorsDevtools: "app-errors:devtools",
	appErrorsChanged: "app-errors:changed",
	/** A live agent's final reply of its last turn (invoke). */
	agentsLastReply: "agents:last-reply",
	agentsInterrupt: "agents:interrupt",
	/** Agents' worktrees of the app repo: find one, open it in the editor (invoke). */
	worktreesFind: "worktrees:find",
	worktreesOpen: "worktrees:open",
	/** "While you were away": the waiting summary and dismiss (invoke), a new one (main → renderer). */
	awayGet: "away:get",
	awayDismiss: "away:dismiss",
	awaySummary: "away:summary",
	/** Morning plan (office-4as): today's plan, decisions (invoke), changes (main → renderer). */
	planToday: "plan:today",
	planChanged: "plan:changed",
	planApprove: "plan:approve",
	planEdit: "plan:edit",
	planDiscuss: "plan:discuss",
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
	readonly work: WorkBoardApi;
	readonly voice: VoiceApi;
	readonly whatsNew: WhatsNewApi;
	readonly alerts: AlertsApi;
	readonly snoozes: InboxSnoozeApi;
	readonly errors: AppErrorsApi;
	readonly agents: AgentsApi;
	readonly worktrees: WorktreesApi;
	readonly away: AwayApi;
	readonly plan: PlanApi;
}
