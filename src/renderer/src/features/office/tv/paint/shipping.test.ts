import { describe, expect, it } from "vitest";
import { formatSpan, formatUsd, WALL_PAGE_MS, wallPageAt, wallPages } from "./shipping";

describe("SHIPPING figures", () => {
	it("writes spans in minutes, hours or days, and a dash without a figure", () => {
		expect(formatSpan(25 * 60_000)).toBe("25m");
		expect(formatSpan(130 * 60_000)).toBe("2h 10m");
		expect(formatSpan(3 * 3_600_000)).toBe("3h");
		expect(formatSpan(27 * 3_600_000)).toBe("1d 3h");
		expect(formatSpan(null)).toBe("—");
	});

	it("writes cost to the cent under $10, whole dollars above", () => {
		expect(formatUsd(1.4)).toBe("~$1.40");
		expect(formatUsd(12.6)).toBe("~$13");
		expect(formatUsd(null)).toBe("—");
	});

	it("puts every figure on its own wall page: today against yesterday, the three medians, the queue", () => {
		const pages = wallPages({
			today: 7,
			yesterday: 5,
			leadMs: 130 * 60_000,
			reviewMs: 35 * 60_000,
			usd: 3.4,
			ready: 4,
			inReview: 2,
		});
		expect(pages.map((page) => [page.value, page.label, page.aside?.text])).toEqual([
			["7", "shipped today", "yest. 5 ▲"],
			["2h 10m", "start → close", undefined],
			["35m", "in review", undefined],
			["~$3.40", "AI per bead", undefined],
			["4 · 2", "ready · review", undefined],
		]);
	});

	it("turns the wall page every few seconds and wraps", () => {
		expect(wallPageAt(0, 5)).toBe(0);
		expect(wallPageAt(WALL_PAGE_MS, 5)).toBe(1);
		expect(wallPageAt(5 * WALL_PAGE_MS, 5)).toBe(0);
	});
});
