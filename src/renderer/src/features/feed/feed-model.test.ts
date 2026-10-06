import { describe, expect, it } from "vitest";
import {
	eventToDraft,
	FEED_LIMIT,
	type FeedDraft,
	type FeedItem,
	messageToDraft,
	modelDiffDrafts,
	pushItem,
	workoutToDraft,
} from "./feed-model";

const names = new Map([["p1", "ava"]]);
const status = (agent_status: string, event = "pane_agent_status_changed") => ({
	event,
	data: { pane_id: "p1", agent_status },
});

describe("eventToDraft", () => {
	it("phrases status transitions with the snapshot name", () => {
		expect(eventToDraft(status("working"), names)).toMatchObject({
			agent: "Ava",
			action: "started working",
			paneId: "p1",
		});
		expect(eventToDraft(status("done", "pane.agent_status_changed"), names)?.action).toBe(
			"finished — waiting for you",
		);
		expect(eventToDraft(status("blocked"), names)?.action).toBe("needs you (blocked)");
	});

	it("ignores noise and unknown statuses", () => {
		expect(eventToDraft({ event: "pane_updated", data: { pane_id: "p1" } }, names)).toBeNull();
		expect(eventToDraft({ event: "layout_updated", data: {} }, names)).toBeNull();
		expect(eventToDraft(status("unknown"), names)).toBeNull();
	});

	it("reports agents leaving, falling back to the pane id", () => {
		expect(eventToDraft({ event: "pane_closed", data: { pane_id: "p9" } }, names)).toMatchObject({
			agent: "P9",
			action: "left the office",
		});
	});
});

describe("other sources", () => {
	it("shows only delivered mail", () => {
		const message = {
			id: "m",
			from: "jonas",
			to: "nora",
			text: "Coffee?",
			sentAt: "",
			state: "delivered" as const,
		};
		expect(messageToDraft(message)).toMatchObject({ agent: "Jonas → Nora", action: "Coffee?" });
		expect(messageToDraft({ ...message, state: "queued" })).toBeNull();
	});

	it("counts workout participants", () => {
		const workout = {
			id: "w",
			reason: "manual" as const,
			startedAt: 0,
			agents: ["a", "b", "c", "d"],
		};
		expect(workoutToDraft(workout).action).toBe("calisthenics break (4 agents)");
	});

	it("reports only agents whose model or thinking changed", () => {
		const before = {
			ava: { model: "anthropic/claude-opus-5-5", thinking: "high" },
			ben: { model: "anthropic/claude-opus-5-5", thinking: "high" },
		};
		const after = { ...before, ava: { model: "anthropic/claude-sonnet-5-5", thinking: "medium" } };
		expect(modelDiffDrafts(before, after)).toEqual([
			{ agent: "Ava", action: "now on Sonnet 5.5 · medium", tone: "neutral" },
		]);
	});
});

describe("pushItem", () => {
	const draft: FeedDraft = {
		agent: "Ava",
		action: "started working",
		tone: "working",
		paneId: "p1",
	};

	it("puts newest first and drops a repeated transition", () => {
		const one = pushItem([], draft, 1, "a");
		expect(pushItem(one, draft, 2, "b")).toBe(one);
		const two = pushItem(one, { ...draft, action: "went idle", tone: "idle" }, 3, "c");
		expect(two.map((item) => item.id)).toEqual(["c", "a"]);
		expect(pushItem(two, draft, 4, "d")[0]?.id).toBe("d");
	});

	it("caps the list", () => {
		let items: readonly FeedItem[] = [];
		for (let i = 0; i < FEED_LIMIT + 5; i++)
			items = pushItem(items, { ...draft, paneId: `p${i}` }, i, `${i}`);
		expect(items).toHaveLength(FEED_LIMIT);
		expect(items[0]?.id).toBe(`${FEED_LIMIT + 4}`);
	});
});
