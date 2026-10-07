import { agent, snapshot, workspace } from "@shared/herdr/fixtures/snapshot";
import type { AgentStatus } from "@shared/herdr/schema";
import { describe, expect, it } from "vitest";
import { inboxAgents, splitSnoozed, type TrustItem, trustInbox } from "./trust-inbox";

function office(...agents: [string, string, AgentStatus, number][]) {
	return inboxAgents(
		snapshot({
			workspaces: [workspace("w1", "sales"), workspace("w2", "delivery")],
			agents: agents.map(([name, paneId, status, seq]) => ({
				...agent(name, paneId),
				agent_status: status,
				state_change_seq: seq,
			})),
		}),
	);
}

const summary = (items: readonly TrustItem[]) =>
	items.map((item) => {
		if (item.kind === "ask") return `ask:${item.ask.id}`;
		if (item.kind === "error") return `error:${item.error.id}`;
		return `${item.kind}:${item.agent.name}`;
	});

const ask = (id: string) => ({
	id,
	question: id,
	detail: "",
	asker: "nora",
	blocks: [],
	createdAt: "",
});

describe("trustInbox", () => {
	it("lists blocked agents first, then finished ones, each by name", () => {
		const agents = office(
			["nora", "w1:p1", "done", 4],
			["jonas", "w1:p2", "blocked", 7],
			["ava", "w2:p1", "working", 2],
			["ben", "w2:p2", "done", 9],
			["emma", "w2:p3", "blocked", 1],
			["finn", "w2:p4", "idle", 3],
		);
		expect(summary(trustInbox({ agents, seen: {} }))).toEqual([
			"blocked:emma",
			"blocked:jonas",
			"done:ben",
			"done:nora",
		]);
	});

	it("puts agents' asks for Jeremy after blocked agents and before finished work, in main's order", () => {
		const agents = office(["nora", "w1:p1", "done", 4], ["jonas", "w1:p2", "blocked", 7]);
		expect(summary(trustInbox({ agents, seen: {}, asks: [ask("o-ask2"), ask("o-ask1")] }))).toEqual(
			["blocked:jonas", "ask:o-ask2", "ask:o-ask1", "done:nora"],
		);
	});

	it("hides exactly the done that was seen; the others stay", () => {
		const agents = office(
			["nora", "w1:p1", "done", 4],
			["ben", "w2:p2", "done", 9],
			["finn", "w2:p4", "done", 3],
		);
		expect(summary(trustInbox({ agents, seen: { ben: 9 } }))).toEqual(["done:finn", "done:nora"]);
	});

	it("hides a seen done until the agent finishes again", () => {
		const seen = { nora: 4, jonas: 7 };
		const before = office(["nora", "w1:p1", "done", 4], ["jonas", "w1:p2", "blocked", 7]);
		// Seen never hides a blocked agent: it still needs the user.
		expect(summary(trustInbox({ agents: before, seen }))).toEqual(["blocked:jonas"]);
		const finishedAgain = office(["nora", "w1:p1", "done", 6]);
		expect(summary(trustInbox({ agents: finishedAgain, seen }))).toEqual(["done:nora"]);
	});

	it("is empty with no snapshot", () => {
		expect(trustInbox({ agents: inboxAgents(null), seen: {} })).toEqual([]);
	});

	it("puts runaway spenders after asks and before finished work, and drops ones no longer in the office", () => {
		const agents = office(["nora", "w1:p1", "done", 4], ["jonas", "w1:p2", "working", 7]);
		const spenders = [
			{ name: "jonas", recentUsd: 9, bead: undefined },
			{ name: "gone", recentUsd: 20, bead: undefined },
		];
		expect(summary(trustInbox({ agents, seen: {}, asks: [ask("office-a1")], spenders }))).toEqual([
			"ask:office-a1",
			"spend:jonas",
			"done:nora",
		]);
	});

	it("shows the app's own errors right after blocked agents, newest first as main lists them", () => {
		const agents = office(["jonas", "w1:p2", "blocked", 7], ["nora", "w1:p1", "done", 4]);
		const error = (id: string) => ({
			id,
			message: id,
			stack: undefined,
			where: "window",
			count: 1,
			firstAt: 0,
			lastAt: 0,
		});
		const items = trustInbox({
			agents,
			seen: {},
			asks: [ask("o-ask1")],
			errors: [error("e2"), error("e1")],
		});
		expect(
			items.map((item) => (item.kind === "error" ? `error:${item.error.id}` : item.kind)),
		).toEqual(["blocked", "error:e2", "error:e1", "ask", "done"]);
	});
});

describe("inboxAgents", () => {
	it("carries the room and the words of the terminal title", () => {
		const [nora] = inboxAgents(
			snapshot({
				workspaces: [workspace("w1", "sales")],
				agents: [
					{ ...agent("nora", "w1:p1"), terminal_title_stripped: "π > Send greeting to Ava" },
				],
			}),
		);
		expect(nora).toMatchObject({ workspaceLabel: "sales", activity: "Send greeting to Ava" });
	});
});

describe("splitSnoozed", () => {
	it("takes snoozed asks and blocked agents (by name, whatever pane) out of the inbox; other kinds never snooze", () => {
		const agents = office(["jonas", "w2:p9", "blocked", 7], ["nora", "w1:p1", "done", 4]);
		const items = trustInbox({ agents, seen: {}, asks: [ask("o-1"), ask("o-2")] });
		const snoozes = [
			{ key: "blocked:jonas", until: 100 },
			{ key: "ask:o-2", until: 200 },
			{ key: "done:nora", until: 300 },
		];
		const { awake, snoozed } = splitSnoozed(items, snoozes);
		expect(summary(awake)).toEqual(["ask:o-1", "done:nora"]);
		expect(snoozed.map(({ item, until }) => [summary([item])[0], until])).toEqual([
			["blocked:jonas", 100],
			["ask:o-2", 200],
		]);
	});
});
