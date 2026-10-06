import type { HerdrEvent, SessionSnapshot } from "./herdr/schema";
import type { TerminalCommand, TerminalOpenRequest } from "./terminal";

/** IPC channel names shared by main, preload and renderer. */
export const IPC = {
	getSnapshot: "office:get-snapshot",
	getStatus: "office:get-status",
	snapshot: "office:snapshot",
	event: "office:event",
	status: "office:status",
	terminalOpen: "terminal:open",
	terminalCommand: "terminal:command",
	terminalClose: "terminal:close",
	terminalFrame: "terminal:frame",
	terminalClosed: "terminal:closed",
} as const;

export type BridgeStatus =
	| { readonly state: "starting" }
	| { readonly state: "connected" }
	| { readonly state: "reconnecting" }
	| { readonly state: "error"; readonly message: string };

export interface TerminalFrameMessage {
	readonly terminalId: string;
	readonly data: Uint8Array;
}

export interface TerminalClosedMessage {
	readonly terminalId: string;
	readonly reason: string;
}

export interface TerminalCommandMessage {
	readonly terminalId: string;
	readonly command: TerminalCommand;
}

export type Unsubscribe = () => void;

/** The API the preload script exposes to the renderer as `window.office`. */
export interface OfficeApi {
	getSnapshot(): Promise<SessionSnapshot | null>;
	getStatus(): Promise<BridgeStatus>;
	onSnapshot(listener: (snapshot: SessionSnapshot) => void): Unsubscribe;
	onEvent(listener: (event: HerdrEvent) => void): Unsubscribe;
	onStatus(listener: (status: BridgeStatus) => void): Unsubscribe;
	terminal: {
		open(request: TerminalOpenRequest): Promise<string>;
		send(terminalId: string, command: TerminalCommand): void;
		close(terminalId: string): void;
		onFrame(terminalId: string, listener: (data: Uint8Array) => void): Unsubscribe;
		onClosed(terminalId: string, listener: (reason: string) => void): Unsubscribe;
	};
}
