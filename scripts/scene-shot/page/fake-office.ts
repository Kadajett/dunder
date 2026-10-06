import { type SessionSnapshot, sessionSnapshotSchema } from "@shared/herdr/schema";
import type { OfficeApi } from "@shared/ipc";

/**
 * A stand-in for the preload's `window.office`, so the real scene renders in a
 * plain browser: no Electron, no herdr, no workforce. The renderer already
 * tolerates a preload without the optional APIs (`"stats" in window.office`),
 * so only the always-present ones are provided. Must be imported before any
 * renderer module, because some read `window.office` at load time.
 */

/** Who sits where in the reference screenshot: workspace label → agents. */
const CREW: Record<string, ReadonlyArray<readonly [string, "working" | "idle"]>> = {
	sales: [
		["nora", "working"],
		["jonas", "working"],
		["emma", "idle"],
	],
	delivery: [
		["ava", "working"],
		["ben", "working"],
		["finn", "idle"],
		["leo", "working"],
	],
	chief: [["max", "working"]],
};

function crewSnapshot(): SessionSnapshot {
	const groups = Object.entries(CREW);
	return sessionSnapshotSchema.parse({
		version: "scene-shot",
		protocol: 0,
		workspaces: groups.map(([label, crew], index) => ({
			workspace_id: `w${index + 1}`,
			label,
			number: index + 1,
			focused: false,
			agent_status: "working",
			pane_count: crew.length,
			tab_count: 1,
		})),
		tabs: [],
		panes: [],
		agents: groups.flatMap(([, crew], ws) =>
			crew.map(([name, status], index) => ({
				pane_id: `w${ws + 1}:p${index + 1}`,
				tab_id: `w${ws + 1}:t1`,
				workspace_id: `w${ws + 1}`,
				terminal_id: `t${ws + 1}-${index + 1}`,
				focused: false,
				agent_status: status,
				agent: "omp",
				name,
			})),
		),
	});
}

const snapshot = crewSnapshot();
const unsubscribe = (): void => undefined;

const fakeOffice = {
	getSnapshot: async () => snapshot,
	getStatus: async () => ({ state: "connected" }),
	onSnapshot: () => unsubscribe,
	onEvent: () => unsubscribe,
	onStatus: () => unsubscribe,
	getWeather: async () => ({ report: null, error: null }),
	onWeather: () => unsubscribe,
	screens: {
		observe: () => undefined,
		unobserve: () => undefined,
		open: async () => "scene-shot",
		send: () => undefined,
		close: () => undefined,
		onMessage: () => unsubscribe,
	},
	calisthenics: {
		onWorkout: () => unsubscribe,
		active: async () => [],
		startNow: async () => undefined,
	},
	switchboard: {
		recent: async () => [],
		onMessage: () => unsubscribe,
	},
	// A sample day's AI spend, so the wall placard shows a figure as it does in the app.
	stats: {
		costToday: async () => ({ state: "ok", day: "2026-10-06", usd: 47.18, sessions: 9 }),
		onCostToday: () => unsubscribe,
		memories: async () => ({ projects: [] }),
		remember: async () => ({ ok: false, reason: "scene-shot" }),
		forget: async () => ({ ok: false, reason: "scene-shot" }),
		markSeen: async () => ({ ok: true }),
	},
} satisfies Pick<
	OfficeApi,
	| "getSnapshot"
	| "getStatus"
	| "onSnapshot"
	| "onEvent"
	| "onStatus"
	| "getWeather"
	| "onWeather"
	| "screens"
	| "calisthenics"
	| "switchboard"
	| "stats"
>;

Object.defineProperty(window, "office", { value: fakeOffice });
