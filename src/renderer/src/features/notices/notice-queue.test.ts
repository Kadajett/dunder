import { describe, expect, it } from "vitest";
import { nextNotice, noticeQueue, shownNotice } from "./notice-queue";

describe("the notice slot's queue", () => {
	it("puts the plan first, then the day's end, then away, then what's new, merging the last two into 'Since you left'", () => {
		const none = { plan: false, dayEnd: false, away: false, whatsNew: false };
		expect(noticeQueue({ ...none, plan: true, away: true })).toEqual(["plan", "away"]);
		expect(noticeQueue({ ...none, whatsNew: true })).toEqual(["whats-new"]);
		expect(noticeQueue({ plan: true, dayEnd: false, away: true, whatsNew: true })).toEqual([
			"plan",
			"since-you-left",
		]);
		expect(noticeQueue({ ...none, dayEnd: true, whatsNew: true })).toEqual([
			"day-end",
			"whats-new",
		]);
		expect(noticeQueue(none)).toEqual([]);
	});

	it("shows the first unless he paged to one still due, and pages round", () => {
		const queue = noticeQueue({ plan: true, dayEnd: false, away: true, whatsNew: false });
		expect(shownNotice(queue, null)).toBe("plan");
		expect(shownNotice(queue, "away")).toBe("away");
		// The one he paged to was dismissed: back to the first.
		expect(shownNotice(["plan"], "away")).toBe("plan");
		expect(nextNotice(queue, "plan")).toBe("away");
		expect(nextNotice(queue, "away")).toBe("plan");
		expect(shownNotice([], null)).toBeNull();
	});
});
