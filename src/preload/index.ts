import {
	IPC,
	type OfficeApi,
	type TerminalClosedMessage,
	type TerminalFrameMessage,
} from "@shared/ipc";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

function listen<T>(channel: string, listener: (payload: T) => void): () => void {
	const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload);
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
}

/** Per-terminal listener fan-out so each screen only sees its own stream. */
function keyedListeners<T>(channel: string, pick: (message: T) => string) {
	const listeners = new Map<string, Set<(message: T) => void>>();
	listen<T>(channel, (message) => {
		for (const listener of listeners.get(pick(message)) ?? []) listener(message);
	});
	return (key: string, listener: (message: T) => void): (() => void) => {
		const set = listeners.get(key) ?? new Set();
		set.add(listener);
		listeners.set(key, set);
		return () => {
			set.delete(listener);
			if (set.size === 0) listeners.delete(key);
		};
	};
}

const onFrame = keyedListeners<TerminalFrameMessage>(IPC.terminalFrame, (m) => m.terminalId);
const onClosed = keyedListeners<TerminalClosedMessage>(IPC.terminalClosed, (m) => m.terminalId);

const api: OfficeApi = {
	getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
	getStatus: () => ipcRenderer.invoke(IPC.getStatus),
	onSnapshot: (listener) => listen(IPC.snapshot, listener),
	onEvent: (listener) => listen(IPC.event, listener),
	onStatus: (listener) => listen(IPC.status, listener),
	terminal: {
		open: (request) => ipcRenderer.invoke(IPC.terminalOpen, request),
		send: (terminalId, command) => ipcRenderer.send(IPC.terminalCommand, { terminalId, command }),
		close: (terminalId) => ipcRenderer.send(IPC.terminalClose, terminalId),
		onFrame: (terminalId, listener) => onFrame(terminalId, (message) => listener(message.data)),
		onClosed: (terminalId, listener) => onClosed(terminalId, (message) => listener(message.reason)),
	},
};

contextBridge.exposeInMainWorld("office", api);
