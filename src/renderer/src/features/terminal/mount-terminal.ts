import type { ScreenPortMessage } from "@shared/screens";
import type { TerminalCommand } from "@shared/terminal";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { type ITheme, Terminal } from "@xterm/xterm";
import { cellAt, type ShortcutAction, shortcutFor, wheelToScroll } from "./terminal-input";

export const TERMINAL_THEME: ITheme = {
	background: "#1d1b22",
	foreground: "#e9e4da",
	cursor: "#f2c66d",
	cursorAccent: "#1d1b22",
	selectionBackground: "#5b5470aa",
};

export interface MountOptions {
	readonly paneId: string;
	/** Wrap pastes in bracketed-paste markers (see `TerminalView`). */
	readonly bracketedPaste: boolean;
	readonly takeover: boolean;
	readonly fontSize?: number;
	onClosed(reason: string): void;
}

export interface MountedTerminal {
	focus(): void;
	/** Recompute cols/rows for the host now, e.g. once a camera tween settles. */
	fit(): void;
	dispose(): void;
}

type Send = (command: TerminalCommand) => void;

const BRACKETED_PASTE_ON = "\x1b[?2004h";
const RESIZE_DEBOUNCE_MS = 120;

function createEmulator(host: HTMLElement, fontSize: number): { term: Terminal; fit: FitAddon } {
	const term = new Terminal({
		allowProposedApi: true,
		cursorBlink: true,
		fontFamily: '"JetBrains Mono", ui-monospace, monospace',
		fontSize,
		// herdr owns scrollback; the local emulator only mirrors the visible screen.
		scrollback: 0,
		theme: TERMINAL_THEME,
	});
	const fit = new FitAddon();
	term.loadAddon(fit);
	term.open(host);
	try {
		const webgl = new WebglAddon();
		webgl.onContextLoss(() => webgl.dispose());
		term.loadAddon(webgl);
	} catch {
		// WebGL unavailable: xterm keeps its DOM renderer, which is correct, only slower.
	}
	fit.fit();
	return { term, fit };
}

/** Applies one control session's port traffic to the emulator. */
function applyControlMessage(
	term: Terminal,
	options: MountOptions,
	terminalId: string,
	message: ScreenPortMessage,
): void {
	if (message.type === "status") {
		const { status } = message;
		if (status.kind !== "control" || status.id !== terminalId || status.state !== "closed") return;
		const reason = status.reason ?? "closed";
		term.write(`\r\n\x1b[2m[screen closed: ${reason}]\x1b[0m`);
		options.onClosed(reason);
		return;
	}
	for (const chunk of message.chunks) {
		if (chunk.kind !== "control" || chunk.id !== terminalId) continue;
		if (chunk.reset) {
			// A fresh attach repaints everything; reset drops modes, so re-enable paste brackets.
			term.reset();
			if (options.bracketedPaste) term.write(BRACKETED_PASTE_ON);
		}
		term.write(chunk.data);
	}
}

/** Owns the herdr control stream for one screen; queues input until attached. */
function connectScreen(term: Terminal, options: MountOptions): { send: Send; dispose(): void } {
	const screens = window.office.screens;
	let terminalId: string | undefined;
	let disposed = false;
	const pending: TerminalCommand[] = [];
	/** Port traffic can outrun the `open` reply; hold it until the id is known. */
	const early: ScreenPortMessage[] = [];
	const stopListening = screens.onMessage((message) => {
		if (terminalId) {
			applyControlMessage(term, options, terminalId, message);
			return;
		}
		const forControl =
			message.type === "status"
				? message.status.kind === "control"
				: message.chunks.some((chunk) => chunk.kind === "control");
		if (!disposed && forControl) early.push(message);
	});
	const send: Send = (command) => {
		if (terminalId) screens.send(terminalId, command);
		else pending.push(command);
	};
	const attach = (id: string): void => {
		if (disposed) {
			screens.close(id);
			return;
		}
		terminalId = id;
		for (const message of early.splice(0)) applyControlMessage(term, options, id, message);
		for (const command of pending.splice(0)) send(command);
	};
	const fail = (error: unknown): void => {
		const message = error instanceof Error ? error.message : String(error);
		term.write(`\x1b[31m[could not open screen: ${message}]\x1b[0m`);
		options.onClosed(message);
	};
	const { paneId, takeover } = options;
	screens.open({ paneId, cols: term.cols, rows: term.rows, takeover }).then(attach, fail);
	return {
		send,
		dispose() {
			disposed = true;
			stopListening();
			if (terminalId) screens.close(terminalId);
		},
	};
}

function wireInput(term: Terminal, send: Send): void {
	const runShortcut = (action: ShortcutAction): void => {
		if (action === "copy") {
			const selection = term.getSelection();
			if (selection) void navigator.clipboard.writeText(selection);
		} else if (action === "paste") {
			void navigator.clipboard.readText().then((text) => term.paste(text));
		} else {
			const direction = action === "page-up" ? "up" : "down";
			send({ type: "terminal.scroll", direction, lines: term.rows, source: "page_key" });
		}
	};
	term.attachCustomKeyEventHandler((event) => {
		const action = shortcutFor(event);
		if (!action) return true;
		event.preventDefault();
		runShortcut(action);
		return false;
	});
	term.attachCustomWheelEventHandler((event) => {
		const grid = term.element?.querySelector(".xterm-screen")?.getBoundingClientRect();
		const at = grid ? cellAt({ x: event.clientX, y: event.clientY }, grid, term) : undefined;
		const command = wheelToScroll(event, term.rows, at);
		if (command) send(command);
		event.preventDefault();
		return false;
	});
	term.onData((text) => send({ type: "terminal.input", text }));
	// Animated layouts (camera tweens, window drags) refit every frame; herdr only needs the end size.
	let resizeTimer: number | undefined;
	term.onResize(({ cols, rows }) => {
		window.clearTimeout(resizeTimer);
		resizeTimer = window.setTimeout(
			() => send({ type: "terminal.resize", cols, rows }),
			RESIZE_DEBOUNCE_MS,
		);
	});
}

/** ResizeObserver already batches to once per rendered frame, so fit directly. */
function observeSize(host: HTMLElement, fit: FitAddon): () => void {
	const observer = new ResizeObserver(() => fit.fit());
	observer.observe(host);
	return () => observer.disconnect();
}

/**
 * Mount an xterm.js emulator in `host` and attach it to a herdr pane through a
 * `terminal session control` stream owned by the main process.
 */
export function mountTerminal(host: HTMLElement, options: MountOptions): MountedTerminal {
	const { term, fit } = createEmulator(host, options.fontSize ?? 13);
	if (options.bracketedPaste) term.write(BRACKETED_PASTE_ON);
	const screen = connectScreen(term, options);
	wireInput(term, screen.send);
	const stopObserving = observeSize(host, fit);
	return {
		focus: () => term.focus(),
		fit: () => fit.fit(),
		dispose: () => {
			stopObserving();
			screen.dispose();
			term.dispose();
		},
	};
}
