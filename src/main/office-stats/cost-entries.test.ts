import { describe, expect, it } from "vitest";
import { addToDays, costOnDay, dayKey, parseCostLine } from "./cost-entries";

const assistant = (timestamp: string, total: number) =>
	JSON.stringify({
		type: "message",
		timestamp,
		message: { role: "assistant", usage: { input: 4, output: 131, cost: { total } } },
	});

describe("parseCostLine", () => {
	it("reads the price and time of an assistant turn", () => {
		expect(parseCostLine(assistant("2026-10-06T18:58:59.789Z", 0.008774))).toEqual({
			at: Date.parse("2026-10-06T18:58:59.789Z"),
			usd: 0.008774,
		});
	});

	it("ignores user turns, other entries, unpriced turns and broken lines", () => {
		const user = JSON.stringify({
			type: "message",
			timestamp: "2026-10-06T18:58:59.789Z",
			message: { role: "user", content: "what did the assistant usage cost?" },
		});
		const unpriced = JSON.stringify({
			type: "message",
			timestamp: "2026-10-06T18:58:59.789Z",
			message: { role: "assistant", usage: { input: 1 } },
		});
		for (const line of [
			user,
			unpriced,
			JSON.stringify({ type: "model_change", model: "a/b" }),
			'{"type":"message","message":{"role":"assistant","usage"',
		]) {
			expect(parseCostLine(line)).toBeUndefined();
		}
	});
});

describe("cost per day", () => {
	it("sums only the requested local day across sessions", () => {
		const morning = new Date(2026, 9, 6, 9, 0).getTime();
		const evening = new Date(2026, 9, 6, 22, 30).getTime();
		const yesterday = new Date(2026, 9, 5, 23, 59).getTime();
		const nora = addToDays(new Map(), [
			{ at: morning, usd: 0.25 },
			{ at: yesterday, usd: 4 },
		]);
		const jonas = addToDays(new Map(), [{ at: evening, usd: 0.17 }]);
		const today = dayKey(morning);
		expect(costOnDay([nora, jonas], today)).toBeCloseTo(0.42);
		expect(costOnDay([nora, jonas], dayKey(yesterday))).toBe(4);
		expect(costOnDay([], today)).toBe(0);
	});

	it("keeps accumulating into the same session totals as new lines arrive", () => {
		const at = new Date(2026, 9, 6, 13, 20).getTime();
		const totals = addToDays(new Map(), [{ at, usd: 0.1 }]);
		addToDays(totals, [{ at: at + 60_000, usd: 0.05 }]);
		expect(totals.get(dayKey(at))).toBeCloseTo(0.15);
	});
});
