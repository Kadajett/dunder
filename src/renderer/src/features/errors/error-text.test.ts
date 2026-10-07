import type { AppError } from "@shared/app-errors";
import { describe, expect, it } from "vitest";
import { errorForMax, toldStateFor } from "./error-text";

const error = (over: Partial<AppError> = {}): AppError => ({
	id: "e1",
	message: "Cannot read properties of undefined (reading 'seat')",
	stack: Array.from({ length: 10 }, (_, n) => `    at frame${n} (file.tsx:${n}:1)`).join("\n"),
	where: "boundary:agent cards",
	count: 3,
	firstAt: new Date(2026, 9, 7, 16, 5).getTime(),
	lastAt: new Date(2026, 9, 7, 19, 9).getTime(),
	...over,
});

describe("telling Max about an app error", () => {
	it("says what broke, where, how often since when, with only the head of the stack", () => {
		const text = errorForMax(error());
		expect(text).toContain(
			"Dunder hit an app error (in the agent cards, 3× since 4:05 PM): Cannot read properties of undefined (reading 'seat')",
		);
		expect(text).toContain("frame0");
		expect(text).toContain("frame5");
		expect(text).not.toContain("frame6");
		expect(text).toMatch(/look into it\?$/);
	});

	it("gives a one-off its time and leaves out a stack it doesn't have", () => {
		const text = errorForMax(error({ count: 1, stack: undefined, where: "promise" }));
		expect(text).toContain("(unhandled promise, at 7:09 PM)");
		expect(text).not.toContain("```");
	});

	it("shows 'sent' until the error happens again, then offers to tell Max again", () => {
		const sent = { state: "sent", count: 3 } as const;
		expect(toldStateFor(error(), sent)).toBe(sent);
		expect(toldStateFor(error({ count: 4 }), sent)).toBeUndefined();
		expect(toldStateFor(error(), undefined)).toBeUndefined();
	});
});
