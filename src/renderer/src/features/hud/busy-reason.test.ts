import { describe, expect, it } from "vitest";
import { type BusyInputs, busyReason } from "./busy-reason";

const free: BusyInputs = {
	onCall: false,
	focused: true,
	focus: null,
	whiteboard: false,
	hiring: false,
	typing: false,
};

describe("busyReason", () => {
	it("is free when nothing is going on", () => {
		expect(busyReason(free)).toBeNull();
	});

	it("names what he is doing, a call first", () => {
		expect(busyReason({ ...free, onCall: true, focus: "screen", typing: true })).toBe("on a call");
		expect(busyReason({ ...free, focus: "screen", typing: true })).toBe("in a terminal");
		expect(busyReason({ ...free, focus: "table" })).toBe("at the pool table");
		expect(busyReason({ ...free, whiteboard: true })).toBe("on the whiteboard");
		expect(busyReason({ ...free, hiring: true })).toBe("hiring");
		expect(busyReason({ ...free, typing: true })).toBe("typing");
	});

	it("counts only a call while Dunder is in the background", () => {
		const away = { ...free, focused: false, focus: "screen" as const, typing: true, hiring: true };
		expect(busyReason(away)).toBeNull();
		expect(busyReason({ ...away, onCall: true })).toBe("on a call");
	});
});
