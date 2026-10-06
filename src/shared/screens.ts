import type { TerminalCommand, TerminalOpenRequest } from "./terminal";

/**
 * Live terminal screens shared by main and renderer.
 * - observe: read-only `terminal session observe` stream per pane, ref-counted
 *   by subscriber, feeding the ambient monitor textures;
 * - control: one interactive `terminal session control` session per focused
 *   screen.
 * Output reaches the renderer in coalesced chunks over one MessagePort per window.
 */
export type ScreenStreamKind = "observe" | "control";

export interface ScreenChunk {
	readonly kind: ScreenStreamKind;
	/** paneId for observe streams, terminalId for control sessions. */
	readonly id: string;
	/** True when the chunk starts a fresh attach: discard prior screen state first. */
	readonly reset: boolean;
	/** Size of the herdr frame(s) in this chunk. */
	readonly cols: number;
	readonly rows: number;
	/** ANSI bytes, the concatenation of the coalesced herdr frames. */
	readonly data: Uint8Array;
}

export type ScreenState = "connecting" | "live" | "disconnected" | "closed";

export interface ScreenStatus {
	readonly kind: ScreenStreamKind;
	readonly id: string;
	readonly state: ScreenState;
	readonly reason?: string;
}

/** Messages on the per-window MessagePort, main → renderer. */
export type ScreenPortMessage =
	| { readonly type: "chunks"; readonly chunks: readonly ScreenChunk[] }
	| { readonly type: "status"; readonly status: ScreenStatus };

export type Unsubscribe = () => void;

/** Renderer-facing API (exposed by preload as `window.office.screens`). */
export interface ScreensApi {
	/** Start (or join) the pane's observe stream. Idempotent per (subscriberId, paneId). */
	observe(subscriberId: string, paneId: string): void;
	/** Leave the pane's observe stream. Idempotent; the process stops ~2 s after the last leaves. */
	unobserve(subscriberId: string, paneId: string): void;
	/** Open an interactive control session; resolves to its terminalId. */
	open(request: TerminalOpenRequest): Promise<string>;
	send(terminalId: string, command: TerminalCommand): void;
	/** Release and stop a control session. */
	close(terminalId: string): void;
	/** All chunk and status traffic for this window. */
	onMessage(listener: (message: ScreenPortMessage) => void): Unsubscribe;
}
