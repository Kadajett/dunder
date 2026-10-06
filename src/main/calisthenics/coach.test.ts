import type { AgentStatus } from "@shared/herdr/schema";
import { describe, expect, it } from "vitest";
import {
	COMPACT_COMMAND,
	type CoachDeps,
	type CoachLimits,
	coachAgent,
	REFLECTION_PROMPT,
} from "./coach";

const limits: CoachLimits = { pollMs: 1_000, queueMs: 10_000, compactMs: 5_000 };

/** A scripted agent: `statuses[i]` is its status after `i` seconds. */
function fakeOffice(
	statuses: readonly (AgentStatus | undefined)[],
	{ compacts = true, hasConversation = true } = {},
) {
	let clock = 0;
	const sent: { at: number; text: string }[] = [];
	const deps: CoachDeps = {
		statusOf: () => statuses[Math.min(clock / 1_000, statuses.length - 1)],
		prompt: async (_agent, text) => {
			sent.push({ at: clock, text });
		},
		canCompact: async () => hasConversation,
		expectCompaction: () => ({ done: Promise.resolve(compacts), cancel: () => {} }),
		sleep: async (ms) => {
			clock += ms;
		},
		now: () => clock,
	};
	return { deps, sent };
}

describe("coaching one agent", () => {
	it("compacts an idle agent, then asks it to re-read memory and todos", async () => {
		const { deps, sent } = fakeOffice(["idle"]);
		expect(await coachAgent("nora", deps, limits)).toEqual({ result: "prompted", compacted: true });
		expect(sent.map((prompt) => prompt.text)).toEqual([COMPACT_COMMAND, REFLECTION_PROMPT]);
	});

	it("waits for a working agent to finish its turn before compacting", async () => {
		const { deps, sent } = fakeOffice(["working", "working", "working", "idle"]);
		expect((await coachAgent("ben", deps, limits)).result).toBe("prompted");
		expect(sent[0]).toEqual({ at: 3_000, text: COMPACT_COMMAND });
	});

	it("never prompts a blocked agent", async () => {
		const { deps, sent } = fakeOffice(["working", "blocked"]);
		expect((await coachAgent("ava", deps, limits)).result).toBe("blocked");
		expect(sent).toEqual([]);
	});

	it("gives up on an agent that stays busy past the queue limit", async () => {
		const { deps, sent } = fakeOffice(["working"]);
		expect((await coachAgent("jonas", deps, limits)).result).toBe("busy");
		expect(sent).toEqual([]);
	});

	it("still sends the reminder when no compaction shows up", async () => {
		const { deps, sent } = fakeOffice(["idle"], { compacts: false });
		expect(await coachAgent("nora", deps, limits)).toEqual({
			result: "prompted",
			compacted: false,
		});
		expect(sent.at(-1)?.text).toBe(REFLECTION_PROMPT);
	});

	it("skips /compact for a session with nothing to compact, but still sends the reminder", async () => {
		const { deps, sent } = fakeOffice(["idle"], { hasConversation: false });
		expect(await coachAgent("ben", deps, limits)).toEqual({ result: "prompted", compacted: false });
		expect(sent.map((prompt) => prompt.text)).toEqual([REFLECTION_PROMPT]);
	});
});
