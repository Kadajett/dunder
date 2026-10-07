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
	mailQueue: {
		get: () => ipcRenderer.invoke(IPC.mailQueued),
		onChange: (listener) => listen(IPC.mailQueuedChanged, listener),
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
		send: (text, options) => ipcRenderer.invoke(IPC.chiefSend, text, options?.call === true),
	},
	stats: {
		costToday: () => ipcRenderer.invoke(IPC.statsCostToday),
		onCostToday: (listener) => listen(IPC.statsCostTodayChanged, listener),
		memories: () => ipcRenderer.invoke(IPC.statsMemories),
		remember: (request) => ipcRenderer.invoke(IPC.statsRemember, request),
		forget: (cwd, key) => ipcRenderer.invoke(IPC.statsForget, { cwd, key }),
		seenDone: () => ipcRenderer.invoke(IPC.statsSeenDone),
		markSeen: (name, seq) => ipcRenderer.invoke(IPC.statsMarkSeen, { name, seq }),
	},
	companies: {
		list: () => ipcRenderer.invoke(IPC.companiesList),
		current: () => ipcRenderer.invoke(IPC.companiesCurrent),
		onCurrent: (listener) => listen(IPC.companiesChanged, listener),
		switchTo: (id) => ipcRenderer.invoke(IPC.companiesSwitch, id),
		create: (name, subtitle) => ipcRenderer.invoke(IPC.companiesCreate, { name, subtitle }),
		updateSettings: (id, settings) =>
			ipcRenderer.invoke(IPC.companiesUpdateSettings, { id, settings }),
		saveLayout: (layout) => ipcRenderer.invoke(IPC.companiesSaveLayout, layout),
		ensureWorkspace: (label) => ipcRenderer.invoke(IPC.companiesEnsureWorkspace, label),
	},
	workforce: {
		defaults: () => ipcRenderer.invoke(IPC.workforceDefaults),
		checkHarness: (harness) => ipcRenderer.invoke(IPC.workforceCheckHarness, harness),
		hire: (request) => ipcRenderer.invoke(IPC.workforceHire, request),
		fire: (name) => ipcRenderer.invoke(IPC.workforceFire, name),
		restart: (name) => ipcRenderer.invoke(IPC.workforceRestart, name),
	},
	staff: {
		onOutcome: (listener) => listen(IPC.staffOutcome, listener),
	},
	update: {
		status: () => ipcRenderer.invoke(IPC.updateStatus),
		onStatus: (listener) => listen(IPC.updateChanged, listener),
		apply: (reason) => ipcRenderer.invoke(IPC.updateApply, reason),
		cancel: () => ipcRenderer.invoke(IPC.updateCancel),
		setBusy: (busy) => ipcRenderer.invoke(IPC.updateSetBusy, busy),
		previous: () => ipcRenderer.invoke(IPC.updatePrevious),
		rollback: () => ipcRenderer.invoke(IPC.updateRollback),
	},
	whiteboard: {
		get: () => ipcRenderer.invoke(IPC.whiteboardGet),
		put: (request) => ipcRenderer.invoke(IPC.whiteboardPut, request),
		onChanged: (listener) => listen(IPC.whiteboardChanged, listener),
	},
	pool: {
		get: () => ipcRenderer.invoke(IPC.poolGet),
		onChanged: (listener) => listen(IPC.poolChanged, listener),
		onFrame: (listener) => listen(IPC.poolFrame, listener),
		join: () => ipcRenderer.invoke(IPC.poolJoin),
		leave: () => ipcRenderer.invoke(IPC.poolLeave),
		setViewing: (viewing) => ipcRenderer.invoke(IPC.poolViewing, viewing),
		shoot: (input) => ipcRenderer.invoke(IPC.poolShoot, input),
	},
	brainstorm: {
		current: () => ipcRenderer.invoke(IPC.brainstormCurrent),
		onChanged: (listener) => listen(IPC.brainstormChanged, listener),
		start: (topic) => ipcRenderer.invoke(IPC.brainstormStart, topic),
		end: () => ipcRenderer.invoke(IPC.brainstormEnd),
	},
	work: {
		get: () => ipcRenderer.invoke(IPC.workGet),
		onChanged: (listener) => listen(IPC.workChanged, listener),
		create: (title) => ipcRenderer.invoke(IPC.workCreate, title),
		setPriority: (id, priority) => ipcRenderer.invoke(IPC.workPriority, { id, priority }),
		move: (id, lane) => ipcRenderer.invoke(IPC.workMove, { id, lane }),
		assign: (id, assignee) => ipcRenderer.invoke(IPC.workAssign, { id, assignee }),
		respond: (id, response) => ipcRenderer.invoke(IPC.workRespond, { id, response }),
		dismiss: (id) => ipcRenderer.invoke(IPC.workDismiss, id),
	},
	errors: {
		list: () => ipcRenderer.invoke(IPC.appErrorsList),
		onChanged: (listener) => listen(IPC.appErrorsChanged, listener),
		report: (report) => ipcRenderer.send(IPC.appErrorsReport, report),
		dismiss: (id) => ipcRenderer.invoke(IPC.appErrorsDismiss, id),
		openDevtools: () => ipcRenderer.invoke(IPC.appErrorsDevtools),
	},
	agents: {
		lastReply: (name) => ipcRenderer.invoke(IPC.agentsLastReply, name),
		interrupt: (name, reason) => ipcRenderer.invoke(IPC.agentsInterrupt, name, reason),
	},
	worktrees: {
		find: (query) => ipcRenderer.invoke(IPC.worktreesFind, query),
		open: (path) => ipcRenderer.invoke(IPC.worktreesOpen, path),
	},
	away: {
		get: () => ipcRenderer.invoke(IPC.awayGet),
		onSummary: (listener) => listen(IPC.awaySummary, listener),
		dismiss: () => ipcRenderer.invoke(IPC.awayDismiss),
	},
	voice: {
		available: () => ipcRenderer.invoke(IPC.voiceAvailable),
		transcribe: (audio, mimeType) => ipcRenderer.invoke(IPC.voiceTranscribe, audio, mimeType),
		speak: (text) => ipcRenderer.invoke(IPC.voiceSpeak, text),
	},
	whatsNew: {
		get: () => ipcRenderer.invoke(IPC.whatsNewGet),
		rate: (request) => ipcRenderer.invoke(IPC.whatsNewRate, request),
		dismiss: () => ipcRenderer.invoke(IPC.whatsNewDismiss),
	},
	alerts: {
		muted: () => ipcRenderer.invoke(IPC.alertsMuted),
		setMuted: (muted) => ipcRenderer.invoke(IPC.alertsSetMuted, muted),
		onChime: (listener) => listen(IPC.alertsChime, listener),
		onOpen: (listener) => listen(IPC.alertsOpen, listener),
	},
	snoozes: {
		list: () => ipcRenderer.invoke(IPC.snoozesList),
		onChanged: (listener) => listen(IPC.snoozesChanged, listener),
		snooze: (key, choice) => ipcRenderer.invoke(IPC.snoozesSnooze, key, choice),
		unsnooze: (key) => ipcRenderer.invoke(IPC.snoozesUnsnooze, key),
	},
};

contextBridge.exposeInMainWorld("office", api);
