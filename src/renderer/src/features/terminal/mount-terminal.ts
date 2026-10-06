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
	dispose(): void;
}

type Send = (command: TerminalCommand) => void;

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

/** Owns the herdr control stream for one screen; queues input until attached. */
function connectScreen(term: Terminal, options: MountOptions): { send: Send; dispose(): void } {
	const office = window.office.terminal;
	let terminalId: string | undefined;
	let disposed = false;
	const pending: TerminalCommand[] = [];
	const unsubscribers: Array<() => void> = [];
	const send: Send = (command) => {
		if (terminalId) office.send(terminalId, command);
		else pending.push(command);
	};
	const attach = (id: string): void => {
		if (disposed) {
			office.close(id);
			return;
		}
		terminalId = id;
		unsubscribers.push(
			office.onFrame(id, (data) => term.write(data)),
			office.onClosed(id, (reason) => {
				terminalId = undefined;
				term.write(`\r\n\x1b[2m[screen closed: ${reason}]\x1b[0m`);
				options.onClosed(reason);
			}),
		);
		for (const command of pending.splice(0)) send(command);
	};
	const fail = (error: unknown): void => {
		const message = error instanceof Error ? error.message : String(error);
		term.write(`\x1b[31m[could not open screen: ${message}]\x1b[0m`);
		options.onClosed(message);
	};
	const request = {
		paneId: options.paneId,
		cols: term.cols,
		rows: term.rows,
		takeover: options.takeover,
	};
	office.open(request).then(attach, fail);
	return {
		send,
		dispose() {
			disposed = true;
			for (const unsubscribe of unsubscribers) unsubscribe();
			if (terminalId) office.close(terminalId);
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
	term.onResize(({ cols, rows }) => send({ type: "terminal.resize", cols, rows }));
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
	if (options.bracketedPaste) term.write("\x1b[?2004h");
	const screen = connectScreen(term, options);
	wireInput(term, screen.send);
	const stopObserving = observeSize(host, fit);
	return {
		focus: () => term.focus(),
		dispose: () => {
			stopObserving();
			screen.dispose();
			term.dispose();
		},
	};
}
