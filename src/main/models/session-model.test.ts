import { describe, expect, it } from "vitest";
import { applyModelLines, NO_SESSION_MODEL } from "./session-model";

const line = (entry: object) => JSON.stringify(entry);
const model = (name: string) =>
	line({ type: "model_change", id: "m", model: name, role: "default" });
const thinking = (level: string | null) =>
	line({ type: "thinking_level_change", id: "t", thinkingLevel: level, configured: level });

describe("applyModelLines", () => {
	it("takes the latest model and thinking level from omp's session entries", () => {
		const state = applyModelLines(NO_SESSION_MODEL, [
			line({ type: "session", version: 3 }),
			model("anthropic/claude-opus-5-5"),
			thinking("high"),
			line({ type: "message", message: { role: "user", content: "use model_change please" } }),
			model("openai-codex/gpt-5.6-luna"),
			thinking("low"),
		]);
		expect(state).toEqual({ model: "openai-codex/gpt-5.6-luna", thinking: "low", modelChanges: 2 });
	});

	it("clears thinking when omp records a null level", () => {
		const state = applyModelLines(NO_SESSION_MODEL, [thinking("high"), thinking(null)]);
		expect(state.thinking).toBeUndefined();
	});

	it("ignores malformed and unrelated lines, returning the same state", () => {
		const state = applyModelLines(NO_SESSION_MODEL, [model("a/b")]);
		expect(applyModelLines(state, ['{"type":"model_change"', line({ type: "model_change" })])).toBe(
			state,
		);
	});
});
