import { describe, expect, it, vi } from "vitest";
import { type CommandResult, checkHarness, claudeCheck, codexCheck } from "./harness-check";

const ran = (output: string, code: number | null = 0): CommandResult => ({
	code,
	output,
	missing: false,
});
const missing: CommandResult = { code: null, output: "", missing: true };

describe("codex login check", () => {
	it("reads 'codex login status'", () => {
		expect(codexCheck(ran("Logged in using ChatGPT\n"))).toEqual({ state: "ready" });
		expect(codexCheck(ran("WARNING: proceeding…\nNot logged in\n", 1))).toEqual({
			state: "not-ready",
			reason: "codex isn't logged in: run `codex login` in a terminal, then hire",
		});
		expect(codexCheck(missing)).toMatchObject({
			state: "not-ready",
			reason: expect.stringContaining("isn't installed"),
		});
	});

	it("can't tell from a timeout or output it doesn't know", () => {
		expect(codexCheck(ran("", null)).state).toBe("unknown");
		expect(codexCheck(ran("something new\n")).state).toBe("unknown");
	});
});

describe("claude login check", () => {
	it("reads the JSON of 'claude auth status'", () => {
		expect(claudeCheck(ran('{\n  "loggedIn": true,\n  "authMethod": "claude.ai"\n}'))).toEqual({
			state: "ready",
		});
		expect(claudeCheck(ran('{"loggedIn": false, "authMethod": "none"}', 1))).toEqual({
			state: "not-ready",
			reason: "claude isn't logged in: run `claude auth login` in a terminal, then hire",
		});
	});

	it("can't tell from broken or unexpected output", () => {
		expect(claudeCheck(ran("error: unknown command 'auth'", 1)).state).toBe("unknown");
		expect(claudeCheck(ran('{"loggedIn": "maybe"}')).state).toBe("unknown");
		expect(claudeCheck(ran("{ not json"))).toMatchObject({ state: "unknown" });
		expect(claudeCheck(missing).state).toBe("not-ready");
	});
});

describe("checkHarness", () => {
	it("runs each harness's own check; omp needs a model it can use", async () => {
		const run = vi.fn(
			async (command: string): Promise<CommandResult> =>
				command === "codex" ? ran("Logged in using ChatGPT") : ran('{"loggedIn": false}', 1),
		);
		const ompModels = vi.fn(async () => 3);
		expect(await checkHarness("codex", { run, ompModels })).toEqual({ state: "ready" });
		expect(run).toHaveBeenLastCalledWith("codex", ["login", "status"]);
		expect((await checkHarness("claude", { run, ompModels })).state).toBe("not-ready");
		expect(run).toHaveBeenLastCalledWith("claude", ["auth", "status"]);
		expect(await checkHarness("omp", { run, ompModels })).toEqual({ state: "ready" });
		expect((await checkHarness("omp", { run, ompModels: async () => 0 })).state).toBe("not-ready");
		const noCatalog = async (): Promise<number> => {
			throw new Error("omp models ls failed");
		};
		expect((await checkHarness("omp", { run, ompModels: noCatalog })).state).toBe("unknown");
	});
});
