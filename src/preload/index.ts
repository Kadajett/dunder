import { IPC, type ObserveMessage, type OfficeApi, type TerminalCommandMessage } from "@shared/ipc";
import type { ScreenPortMessage, ScreensApi } from "@shared/screens";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";

function listen<T>(channel: string, listener: (payload: T) => void): () => void {
	const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload);
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
}

/**
 * Main sends one MessagePort per page load; every chunk and status arrives on
 * it. Messages are fanned out to the page's listeners, so register
 * `onMessage` before calling `observe`/`open`.
 */
function createScreensApi(): ScreensApi {
	const listeners = new Set<(message: ScreenPortMessage) => void>();
	ipcRenderer.on(IPC.screensPort, (event: IpcRendererEvent) => {
		const [port] = event.ports;
		if (!port) return;
		// A DOM MessagePort at runtime; main is the only writer on it.
		port.onmessage = (event: { readonly data: ScreenPortMessage }) => {
			for (const listener of listeners) listener(event.data);
		};
	});
	ipcRenderer.send(IPC.screensConnect);
	return {
		observe: (subscriberId, paneId) =>
			ipcRenderer.send(IPC.screensObserve, { subscriberId, paneId } satisfies ObserveMessage),
		unobserve: (subscriberId, paneId) =>
			ipcRenderer.send(IPC.screensUnobserve, { subscriberId, paneId } satisfies ObserveMessage),
		open: (request) => ipcRenderer.invoke(IPC.terminalOpen, request),
		send: (terminalId, command) =>
			ipcRenderer.send(IPC.terminalCommand, {
				terminalId,
				command,
			} satisfies TerminalCommandMessage),
		close: (terminalId) => ipcRenderer.send(IPC.terminalClose, terminalId),
		onMessage: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

const api: OfficeApi = {
	getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
	getStatus: () => ipcRenderer.invoke(IPC.getStatus),
	onSnapshot: (listener) => listen(IPC.snapshot, listener),
	onEvent: (listener) => listen(IPC.event, listener),
	onStatus: (listener) => listen(IPC.status, listener),
	getWeather: () => ipcRenderer.invoke(IPC.getWeather),
	onWeather: (listener) => listen(IPC.weather, listener),
	screens: createScreensApi(),
	calisthenics: {
		onWorkout: (listener) => listen(IPC.calisthenicsWorkout, listener),
		active: () => ipcRenderer.invoke(IPC.calisthenicsActive),
		startNow: () => ipcRenderer.invoke(IPC.calisthenicsStart),
	},
	switchboard: {
		recent: () => ipcRenderer.invoke(IPC.switchboardRecent),
		onMessage: (listener) => listen(IPC.switchboardMessage, listener),
	},
	roster: {
		get: () => ipcRenderer.invoke(IPC.getRoster),
		onChange: (listener) => listen(IPC.roster, listener),
	},
	models: {
		catalog: () => ipcRenderer.invoke(IPC.modelsCatalog),
		live: () => ipcRenderer.invoke(IPC.modelsLive),
		onLive: (listener) => listen(IPC.modelsLiveChanged, listener),
		setModel: (agentName, selector, thinking) =>
			ipcRenderer.invoke(IPC.modelsSet, { agentName, selector, thinking }),
	},
	chief: {
		status: () => ipcRenderer.invoke(IPC.chiefStatus),
		history: () => ipcRenderer.invoke(IPC.chiefHistory),
		onMessage: (listener) => listen(IPC.chiefMessage, listener),
		send: (text) => ipcRenderer.invoke(IPC.chiefSend, text),
	},
	stats: {
		costToday: () => ipcRenderer.invoke(IPC.statsCostToday),
		onCostToday: (listener) => listen(IPC.statsCostTodayChanged, listener),
		memories: () => ipcRenderer.invoke(IPC.statsMemories),
		markSeen: (agentName) => ipcRenderer.invoke(IPC.statsMarkSeen, agentName),
	},
};

contextBridge.exposeInMainWorld("office", api);
