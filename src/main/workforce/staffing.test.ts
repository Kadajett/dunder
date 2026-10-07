import { avatarStyleFor } from "@shared/avatar/style";
import type { HarnessCheck } from "@shared/company/workforce";
import { describe, expect, it, vi } from "vitest";
import { Staffing } from "./staffing";

function staffing(check: HarnessCheck) {
	const hire = vi.fn(async () => undefined);
	const service = new Staffing({
		supervisor: {
			roster: () => ({ version: 1, agents: [] }),
			hire,
			fire: vi.fn(),
			respawnSoon: vi.fn(),
		} as never,
		cli: async () => ({ stdout: JSON.stringify({ result: { agents: [] } }), stderr: "" }),
		catalog: async () => [],
		checkHarness: async () => check,
		isDirectory: async () => true,
		sleep: async () => undefined,
	});
	return { service, hire };
}

const request = {
	name: "dev3",
	role: "backend",
	harness: "codex",
	workspaceLabel: "delivery",
	cwd: "/home/j/Dev/app",
	style: avatarStyleFor("dev3"),
};

describe("hiring", () => {
	it("refuses a worker whose harness can't answer, with the reason, before the roster changes", async () => {
		const reason = "codex isn't logged in: run `codex login` in a terminal, then hire";
		const { service, hire } = staffing({ state: "not-ready", reason });
		expect(await service.hire(request)).toEqual({ ok: false, error: `harness: ${reason}` });
		expect(hire).not.toHaveBeenCalled();
	});

	it("hires when the harness is ready, or when the check itself couldn't tell", async () => {
		for (const check of [
			{ state: "ready" },
			{ state: "unknown", reason: "couldn't check codex's login" },
		] as const) {
			const { service, hire } = staffing(check);
			expect(await service.hire(request)).toEqual({ ok: true });
			expect(hire).toHaveBeenCalledOnce();
		}
	});
});
