import type { CalisthenicsApi } from "./calisthenics";
import type { RosterApi } from "./company/roster";
import type { HerdrEvent, SessionSnapshot } from "./herdr/schema";
import type { ModelsApi } from "./models";
import type { ScreensApi, Unsubscribe } from "./screens";
import type { OfficeMessage } from "./switchboard";
import type { TerminalCommand } from "./terminal";
import type { WeatherFeed } from "./tv";

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
	/** Workforce roster: current roster (invoke) and every change (main → renderer). */
	getRoster: "roster:get",
	roster: "roster:changed",
	/** Agent models: omp catalog and live models (invoke), live changes (main → renderer), switch (invoke). */
	modelsCatalog: "models:catalog",
	modelsLive: "models:live",
	modelsLiveChanged: "models:live-changed",
	modelsSet: "models:set",
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
	readonly roster: RosterApi;
	readonly models: ModelsApi;
}
