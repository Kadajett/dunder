import type { WorkResult } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { type WorkWrites, workRequestHandlers } from "./requests";

function harness() {
	const calls: unknown[][] = [];
	const ok = (...args: unknown[]): Promise<WorkResult> => {
		calls.push(args);
		return Promise.resolve({ ok: true });
	};
	const writes: WorkWrites = {
		create: (title) => ok("create", title),
		setPriority: (id, priority) => ok("setPriority", id, priority),
		move: (id, lane) => ok("move", id, lane),
		assign: (id, assignee) => ok("assign", id, assignee),
	};
	return { handlers: workRequestHandlers(writes), calls };
}

describe("workRequestHandlers", () => {
	it("passes valid payloads through, trimming titles", async () => {
		const { handlers, calls } = harness();
		await handlers.create("  Ship the board  ");
		await handlers.setPriority({ id: "office-344.2", priority: 0 });
		await handlers.move({ id: "office-344.2", lane: "done" });
		await handlers.assign({ id: "office-344.2", assignee: "theo" });
		await handlers.assign({ id: "office-344.2", assignee: null });
		expect(calls).toEqual([
			["create", "Ship the board"],
			["setPriority", "office-344.2", 0],
			["move", "office-344.2", "done"],
			["assign", "office-344.2", "theo"],
			["assign", "office-344.2", null],
		]);
	});

	it.each([
		["create", "   "],
		["create", "x".repeat(201)],
		["create", 42],
		["setPriority", { id: "office-1", priority: 5 }],
		["setPriority", { id: "office-1", priority: 1.5 }],
		["setPriority", { id: "--status=closed", priority: 1 }],
		["move", { id: "office-1", lane: "deferred" }],
		["move", { id: "office-1", lane: "done", extra: true }],
		["assign", { id: "office-1", assignee: "--title=x" }],
		["assign", { id: "office-1", assignee: "" }],
		["assign", { id: "office-1" }],
	] as const)("rejects %s(%j) without running bd", async (method, payload) => {
		const { handlers, calls } = harness();
		const result = await handlers[method](payload);
		expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/^invalid request/) });
		expect(calls).toEqual([]);
	});
});
