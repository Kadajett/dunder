import { describe, expect, it } from "vitest";
import { shortModelName } from "./models";

describe("shortModelName", () => {
	it.each([
		["anthropic/claude-opus-5-5", "opus 5.5"],
		["anthropic/claude-sonnet-5", "sonnet 5"],
		["openai-codex/gpt-5.6-terra", "gpt 5.6 terra"],
		["openrouter/google/gemini-3-pro-preview", "gemini 3 pro preview"],
		[undefined, "default model"],
	])("%s → %s", (selector, label) => {
		expect(shortModelName(selector)).toBe(label);
	});
});
