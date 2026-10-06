import { CHIEF_HISTORY_LIMIT, type ChiefMessage } from "@shared/chief";
import { describe, expect, it } from "vitest";
import { presenceLabel, upsertMessage } from "./chat-model";

const message = (id: string, at: number, extra: Partial<ChiefMessage> = {}): ChiefMessage => ({
	id,
	author: "you",
	text: `message ${id}`,
	at,
	...extra,
});

describe("upsertMessage", () => {
	it("replaces a queued message with its sent update instead of duplicating it", () => {
		const queued = message("a", 10, { state: "queued", reason: "max is busy" });
		const reply = message("b", 20, { author: "chief" });
		const next = upsertMessage([queued, reply], message("a", 10, { state: "sent" }));
		expect(next.map((m) => [m.id, m.state])).toEqual([
			["a", "sent"],
			["b", undefined],
		]);
	});

	it("appends new messages", () => {
		const next = upsertMessage([message("a", 10)], message("b", 20));
		expect(next.map((m) => m.id)).toEqual(["a", "b"]);
	});

	it("keeps messages in time order, same-time ones in arrival order", () => {
		let messages = upsertMessage([], message("late", 30));
		messages = upsertMessage(messages, message("early", 10));
		messages = upsertMessage(messages, message("tie-1", 20));
		messages = upsertMessage(messages, message("tie-2", 20));
		expect(messages.map((m) => m.id)).toEqual(["early", "tie-1", "tie-2", "late"]);
	});

	it("drops the oldest messages beyond the history limit", () => {
		let messages: readonly ChiefMessage[] = [];
		for (let i = 0; i <= CHIEF_HISTORY_LIMIT; i++)
			messages = upsertMessage(messages, message(`m${i}`, i));
		expect(messages).toHaveLength(CHIEF_HISTORY_LIMIT);
		expect(messages[0]?.id).toBe("m1");
		expect(messages.at(-1)?.id).toBe(`m${CHIEF_HISTORY_LIMIT}`);
	});
});

describe("presenceLabel", () => {
	it("maps herdr status to what Jeremy needs to know", () => {
		expect(presenceLabel("idle")).toBe("ONLINE");
		expect(presenceLabel("done")).toBe("ONLINE");
		expect(presenceLabel("working")).toBe("WORKING");
		expect(presenceLabel("blocked")).toBe("NEEDS YOU");
		expect(presenceLabel("unknown")).toBe("OFFLINE");
		expect(presenceLabel("offline")).toBe("OFFLINE");
	});
});
