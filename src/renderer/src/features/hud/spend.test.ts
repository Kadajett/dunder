import type { CostToday } from "@shared/office-stats";
import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { costBreakdown, runawaySpenders, tellMaxText } from "./spend";

const cost: Extract<CostToday, { state: "ok" }> = {
	state: "ok",
	day: "2026-10-06",
	usd: 14.5,
	sessions: 4,
	agents: [
		{ name: "nora", usd: 9, recentUsd: 2 },
		{ name: "ava", usd: 4, recentUsd: 6.25 },
		{ name: "ben", usd: 1.5, recentUsd: 7 },
	],
	untracked: ["kim"],
};

const card = (id: string, assignee: string, lane: WorkCard["lane"]): WorkCard => ({
	id,
	title: `title of ${id}`,
	priority: 2,
	lane,
	assignee,
	epic: null,
	waitingOn: [],
	description: "",
	acceptance: "",
	updatedAt: "",
});

describe("the AI cost tile's breakdown", () => {
	it("lists every agent's spend today, biggest first, then agents it cannot see", () => {
		expect(costBreakdown(cost).split("\n")).toEqual([
			"2026-10-06 · summed from 4 omp session logs",
			"nora  $9.00",
			"ava  $4.00",
			"ben  $1.50",
			"kim  not tracked (not on omp)",
		]);
	});
});

describe("runaway spenders", () => {
	it("flags agents over the threshold in the window, fastest first, with the bead they are on", () => {
		const cards = [card("office-1", "ava", "done"), card("office-2", "ava", "in_progress")];
		expect(runawaySpenders(cost, 5, cards)).toEqual([
			{ name: "ben", recentUsd: 7, bead: undefined },
			{ name: "ava", recentUsd: 6.25, bead: { id: "office-2", title: "title of office-2" } },
		]);
	});

	it("clears once the window's spend is back under the threshold, or without cost data", () => {
		expect(runawaySpenders(cost, 7)).toEqual([]);
		expect(runawaySpenders({ state: "unavailable", reason: "x" }, 0)).toEqual([]);
	});

	it("writes Max a message naming the agent, the spend and the bead", () => {
		const text = tellMaxText(
			{ name: "ava", recentUsd: 6.25, bead: { id: "office-2", title: "Fix it" } },
			30,
		);
		expect(text).toBe(
			"ava has spent $6.25 in the last 30 minutes on office-2 (Fix it). Can you check whether it's stuck in a loop?",
		);
	});
});
