import { CHIEF_PROMPT_PREFIX } from "@shared/chief";
import { describe, expect, it } from "vitest";
import { chiefPrompt, planChiefSend } from "./send-plan";

describe("planChiefSend", () => {
	it("sends while the chief waits for a prompt", () => {
		expect(planChiefSend("max", "idle")).toEqual({ kind: "send" });
		expect(planChiefSend("max", "done")).toEqual({ kind: "send" });
	});

	it("queues while he works, naming him", () => {
		expect(planChiefSend("max", "working")).toEqual({
			kind: "queue",
			reason: "Max is working; your message goes in when he's free",
		});
	});

	it("rejects while he waits on an approval", () => {
		expect(planChiefSend("max", "blocked")).toEqual({
			kind: "reject",
			reason: "Max is waiting on an approval — open his screen to answer it",
		});
	});

	it("queues while he is offline or his state is unknown", () => {
		for (const presence of ["offline", "unknown"] as const) {
			const plan = planChiefSend("max", presence);
			expect(plan.kind).toBe("queue");
			expect(plan.kind === "queue" && plan.reason.startsWith("Max isn't at his desk yet;")).toBe(
				true,
			);
		}
	});
});

describe("chiefPrompt", () => {
	it("prefixes one message", () => {
		expect(chiefPrompt(["hello"])).toBe(`${CHIEF_PROMPT_PREFIX} hello`);
	});

	it("joins several queued messages into one prompt", () => {
		expect(chiefPrompt(["first", "second"])).toBe(`${CHIEF_PROMPT_PREFIX} first\n\nsecond`);
	});
});
