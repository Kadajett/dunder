import { CHIEF_PROMPT_PREFIX } from "@shared/chief";
import { describe, expect, it } from "vitest";
import { extractReplies, INITIAL_REPLY_STATE } from "./replies";

const T0 = "2026-10-06T18:58:59.789Z";

function message(id: string, role: string, content: readonly unknown[], timestamp = T0): string {
	return JSON.stringify({
		type: "message",
		id,
		parentId: null,
		timestamp,
		message: { role, content },
	});
}

const text = (value: string) => ({ type: "text", text: value });
const jeremy = (id: string, value: string) =>
	message(id, "user", [text(`${CHIEF_PROMPT_PREFIX} ${value}`)]);

describe("extractReplies", () => {
	it("returns the visible text of the chief's answer to Jeremy", () => {
		const lines = [
			jeremy("u1", "how is nora doing?"),
			message("a1", "assistant", [
				{ type: "thinking", thinking: "let me check" },
				text("Nora is on the auth refactor."),
				{ type: "toolCall", id: "t1", name: "bash", arguments: {} },
				text("  She expects to finish today.  "),
			]),
		];
		const { replies } = extractReplies(INITIAL_REPLY_STATE, lines);
		expect(replies).toEqual([
			{
				entryId: "a1",
				text: "Nora is on the auth refactor.\n\nShe expects to finish today.",
				at: Date.parse(T0),
			},
		]);
	});

	it("yields one reply per assistant message with text across a tool loop", () => {
		const lines = [
			jeremy("u1", "ship it"),
			message("a1", "assistant", [
				text("Checking the build first."),
				{ type: "toolCall", id: "t1" },
			]),
			message("r1", "toolResult", [text("build ok")]),
			message("a2", "assistant", [{ type: "toolCall", id: "t2" }]),
			message("r2", "toolResult", [text("pushed")]),
			message("a3", "assistant", [text("Shipped.")]),
		];
		const { replies } = extractReplies(INITIAL_REPLY_STATE, lines);
		expect(replies.map((reply) => [reply.entryId, reply.text])).toEqual([
			["a1", "Checking the build first."],
			["a3", "Shipped."],
		]);
	});

	it("skips turns started by anyone other than Jeremy or the office", () => {
		const lines = [
			jeremy("u1", "hi"),
			message("a1", "assistant", [text("Hello Jeremy.")]),
			message("u2", "user", [text("Time for calisthenics: 10 squats.")]),
			message("a2", "assistant", [text("Done with squats.")]),
		];
		const { state, replies } = extractReplies(INITIAL_REPLY_STATE, lines);
		expect(replies.map((reply) => reply.entryId)).toEqual(["a1"]);
		expect(state.listening).toBe(false);
	});

	it("captures the chief relaying a teammate's office message", () => {
		const lines = [
			message("u1", "user", [text("[office message from nora] auth refactor merged")]),
			message("a1", "assistant", [text("Nora merged the auth refactor.")]),
		];
		const { replies } = extractReplies(INITIAL_REPLY_STATE, lines);
		expect(replies.map((reply) => reply.text)).toEqual(["Nora merged the auth refactor."]);
	});

	it("ignores garbage, other entry types and malformed messages", () => {
		const lines = [
			"not json",
			'{"type":"message", broken',
			JSON.stringify({ type: "compaction", summary: "x".repeat(100_000) }),
			JSON.stringify({ type: "model_change", model: "anthropic/opus" }),
			jeremy("u1", "status?"),
			JSON.stringify({ type: "message", id: "bad", message: { role: "assistant" } }),
			message("a1", "assistant", [text("All green.")]),
		];
		const { replies } = extractReplies(INITIAL_REPLY_STATE, lines);
		expect(replies.map((reply) => reply.entryId)).toEqual(["a1"]);
	});

	it("carries listening across chunked calls", () => {
		const first = extractReplies(INITIAL_REPLY_STATE, [jeremy("u1", "plan the sprint")]);
		expect(first.replies).toEqual([]);
		const second = extractReplies(first.state, [
			message("a1", "assistant", [text("Here is the plan.")]),
		]);
		expect(second.replies.map((reply) => reply.entryId)).toEqual(["a1"]);
		const before = extractReplies(INITIAL_REPLY_STATE, [
			message("a0", "assistant", [text("Earlier.")]),
		]);
		expect(before.replies).toEqual([]);
	});
});
