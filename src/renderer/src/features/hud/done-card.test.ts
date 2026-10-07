import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { agentBead, REPLY_MAX_LINES, replyShown } from "./done-card";

const NOW = Date.parse("2026-10-07T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const card = (id: string, fields: Partial<WorkCard>): WorkCard => ({
	id,
	title: id,
	priority: 2,
	lane: "ready",
	assignee: "nora",
	epic: null,
	waitingOn: [],
	description: "",
	acceptance: "",
	updatedAt: hoursAgo(1),
	startedAt: null,
	spend: null,
	epicSpend: null,
	...fields,
});

describe("agentBead", () => {
	it("prefers the agent's In progress bead over anything it closed", () => {
		const cards = [
			card("closed", { lane: "done", updatedAt: hoursAgo(0.1) }),
			card("working", { lane: "in_progress", updatedAt: hoursAgo(5) }),
			card("theirs", { lane: "in_progress", assignee: "theo" }),
		];
		expect(agentBead(cards, "nora", NOW)?.id).toBe("working");
	});

	it("else takes the bead it closed most recently in the last day, and none older or unowned", () => {
		const cards = [
			card("older", { lane: "done", updatedAt: hoursAgo(3) }),
			card("newest", { lane: "done", updatedAt: hoursAgo(1) }),
			card("ready", { lane: "ready", updatedAt: hoursAgo(0) }),
		];
		expect(agentBead(cards, "nora", NOW)?.id).toBe("newest");
		expect(
			agentBead([card("stale", { lane: "done", updatedAt: hoursAgo(25) })], "nora", NOW),
		).toBeNull();
		expect(agentBead(cards, "mika", NOW)).toBeNull();
	});
});

describe("replyShown", () => {
	const lines = (count: number) =>
		Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n");

	it("shows 3 lines with 'more', then up to 40 with a pointer to the screen", () => {
		expect(replyShown(lines(2), false)).toEqual({ text: lines(2), more: false, cut: false });
		expect(replyShown(lines(10), false)).toEqual({ text: lines(3), more: true, cut: false });
		expect(replyShown(lines(10), true)).toEqual({ text: lines(10), more: false, cut: false });
		const long = replyShown(lines(60), true);
		expect(long.text.split("\n")).toHaveLength(REPLY_MAX_LINES);
		expect(long.cut).toBe(true);
	});
});
