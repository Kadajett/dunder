import { describe, expect, it } from "vitest";
import { formatSpan, formatUsd } from "./shipping";

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
});
