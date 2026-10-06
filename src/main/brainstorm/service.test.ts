import type { Brainstorm } from "@shared/brainstorm";
import { agent, snapshot } from "@shared/herdr/fixtures/snapshot";
import type { AgentStatus } from "@shared/herdr/schema";
import { describe, expect, it } from "vitest";
import { BrainstormService } from "./service";

const NOW = Date.parse("2026-10-06T15:00:00.000Z");

function office(crew: readonly [string, string, AgentStatus][]) {
	return snapshot({
		agents: crew.map(([name, paneId, status]) => ({
			...agent(name, paneId),
			agent_status: status,
		})),
	});
}

function setup() {
	const emitted: (Brainstorm | null)[] = [];
	const prompts: { agent: string; text: string }[] = [];
	let clock = NOW;
	const service = new BrainstormService({
		emit: (brainstorm) => emitted.push(brainstorm),
		prompt: async (agent, text) => {
			prompts.push({ agent, text });
		},
		chiefName: () => "max",
		boardText: async () => "- nora: demo day",
		// Each poll moves the clock on, so waiting on a busy agent ends.
		sleep: async (ms) => {
			clock += ms;
		},
		now: () => clock,
	});
	return { service, emitted, prompts };
}

const line = (fromPane: string, request: object) =>
	JSON.stringify({
		v: 1,
		id: "req-12345678",
		fromPane,
		requestedAt: new Date(NOW).toISOString(),
		...request,
	});

describe("BrainstormService", () => {
	it("gathers every agent and invites all but the starter with the topic and the board", async () => {
		const { service, emitted, prompts } = setup();
		service.updateSnapshot(
			office([
				["max", "w1:p1", "idle"],
				["nora", "w1:p2", "idle"],
				["ava", "w2:p1", "done"],
			]),
		);
		service.receive([line("w1:p1", { op: "start", topic: "Q4 launch" })]);
		await service.invited();
		expect(emitted).toMatchObject([
			{ topic: "Q4 launch", by: "max", agents: ["max", "nora", "ava"] },
		]);
		expect(prompts.map((prompt) => prompt.agent)).toEqual(["nora", "ava"]);
		expect(prompts[0]?.text).toContain('"Q4 launch"');
		expect(prompts[0]?.text).toContain("- nora: demo day");
		expect(prompts[0]?.text).toContain("office-board note");
	});

	it("takes start and end only from the chief of staff", async () => {
		const { service, emitted } = setup();
		service.updateSnapshot(
			office([
				["max", "w1:p1", "idle"],
				["nora", "w1:p2", "idle"],
			]),
		);
		service.receive([line("w1:p2", { op: "start", topic: "nora's idea" })]);
		expect(emitted).toEqual([]);
		service.start("From the HUD", "Jeremy");
		service.receive([line("w1:p2", { op: "end" })]);
		expect(service.current()?.topic).toBe("From the HUD");
		service.receive([line("w1:p1", { op: "end" })]);
		expect(service.current()).toBeNull();
		expect(emitted.at(-1)).toBeNull();
		await service.invited();
	});

	it("leaves a blocked agent's dialog alone", async () => {
		const { service, prompts } = setup();
		service.updateSnapshot(office([["nora", "w1:p2", "blocked"]]));
		service.start("Q4 launch", "Jeremy");
		await service.invited();
		expect(prompts).toEqual([]);
	});

	it("invites nobody who comes free after the brainstorm ended", async () => {
		const { service, prompts } = setup();
		service.updateSnapshot(office([["ava", "w2:p1", "working"]]));
		service.start("Q4 launch", "Jeremy");
		service.end();
		// Ava's turn finishes after the end: there is nothing left to join.
		service.updateSnapshot(office([["ava", "w2:p1", "idle"]]));
		await service.invited();
		expect(prompts).toEqual([]);
	});
});
