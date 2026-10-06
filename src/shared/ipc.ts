import type { HerdrEvent, SessionSnapshot } from "./herdr/schema";
import type { ScreensApi, Unsubscribe } from "./screens";
import type { TerminalCommand } from "./terminal";

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
	readonly screens: ScreensApi;
}
