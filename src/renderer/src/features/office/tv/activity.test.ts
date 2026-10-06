import type { SessionSnapshot } from "@shared/herdr/schema";
import { describe, expect, it } from "vitest";
import { type ActivityNames, describeEvent, learnNames } from "./activity";
import { officePulse } from "./pulse";
import { describeWeather, forecastDayLabel } from "./weather-codes";

const agent = (pane: string, workspace: string, status: "working" | "idle", name: string) => ({
	pane_id: pane,
	tab_id: "t1",
	workspace_id: workspace,
	terminal_id: pane,
	focused: false,
	agent_status: status,
	agent: "omp",
	name,
	label: undefined,
	cwd: undefined,
	foreground_cwd: undefined,
	terminal_title_stripped: undefined,
});

const workspace = (id: string, label: string, number: number) => ({
	workspace_id: id,
	label,
	number,
	focused: false,
	agent_status: "idle" as const,
	pane_count: 2,
	tab_count: 1,
	active_tab_id: undefined,
});

// Built loosely and cast once: sibling slices may add optional agent fields.
const SNAPSHOT = {
	version: "1",
	protocol: 1,
	workspaces: [workspace("w2", "delivery", 2), workspace("w1", "sales", 1)],
	tabs: [],
	panes: [],
	agents: [
		agent("w1:p1", "w1", "working", "nora"),
		agent("w1:p4", "w1", "idle", "jonas"),
		agent("w2:p1", "w2", "working", "ava"),
	],
} as unknown as SessionSnapshot;

const EMPTY: ActivityNames = { panes: new Map(), workspaces: new Map() };

describe("describeEvent", () => {
	const names = learnNames(EMPTY, SNAPSHOT);

	it("names the agent whose status changed and tones the line by status", () => {
		// Per-pane subscriptions arrive dotted; topology events arrive underscored.
		const event = {
			event: "pane.agent_status_changed",
			data: { pane_id: "w1:p1", agent_status: "blocked" },
		};
		expect(describeEvent(event, names)).toEqual({
			text: "nora is blocked: needs you",
			tone: "blocked",
		});
	});

	it("keeps a closed agent's name after it leaves the snapshot", () => {
		const later = learnNames(names, { ...SNAPSHOT, agents: [] });
		const event = { event: "pane_closed", data: { pane_id: "w2:p1", workspace_id: "w2" } };
		expect(describeEvent(event, later)?.text).toBe("ava left delivery");
	});

	it("drops topology noise and statuses it cannot phrase, falls back to ids", () => {
		expect(describeEvent({ event: "layout_updated", data: {} }, names)).toBeNull();
		expect(describeEvent({ event: "pane_updated", data: {} }, names)).toBeNull();
		const odd = {
			event: "pane_agent_status_changed",
			data: { pane_id: "w1:p1", agent_status: "unknown" },
		};
		expect(describeEvent(odd, names)).toBeNull();
		const stranger = { event: "pane_created", data: { pane: { pane_id: "w9:p9" } } };
		expect(describeEvent(stranger, names)?.text).toBe("new pane w9:p9");
		expect(describeEvent({ event: "worktree_opened", data: {} }, names)?.text).toBe(
			"worktree opened",
		);
	});

	it("tolerates malformed payload fields", () => {
		const event = {
			event: "pane_agent_status_changed",
			data: { pane_id: 42, agent_status: "done" },
		};
		expect(describeEvent(event, names)).toEqual({ text: "someone finished", tone: "done" });
	});
});

describe("officePulse", () => {
	it("counts agents by status and lists workspaces in herdr order", () => {
		const pulse = officePulse(SNAPSHOT);
		expect(pulse.total).toBe(3);
		expect(pulse.byStatus).toMatchObject({ working: 2, idle: 1, blocked: 0 });
		expect(pulse.workspaces).toEqual([
			{ label: "sales", statuses: ["working", "idle"] },
			{ label: "delivery", statuses: ["working"] },
		]);
	});
});

describe("weather codes", () => {
	it("maps WMO code families to skies, with fog where SF needs it", () => {
		expect(describeWeather(0).sky).toBe("clear");
		expect(describeWeather(45).sky).toBe("fog");
		expect(describeWeather(48).sky).toBe("fog");
		expect(describeWeather(53).sky).toBe("drizzle");
		expect(describeWeather(81).sky).toBe("rain");
		expect(describeWeather(86).sky).toBe("snow");
		expect(describeWeather(99).sky).toBe("storm");
		expect(describeWeather(1234).label).toBe("Who knows");
	});

	it("labels forecast columns TODAY then by weekday", () => {
		expect(forecastDayLabel("2026-10-06", 0)).toBe("TODAY");
		expect(forecastDayLabel("2026-10-07", 1)).toBe("WED");
	});
});
