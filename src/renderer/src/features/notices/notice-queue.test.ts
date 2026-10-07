import { describe, expect, it } from "vitest";
import { nextNotice, noticeQueue, shownNotice } from "./notice-queue";

describe("the notice slot's queue", () => {
	it("puts the plan first, then away, then what's new, merging the last two into 'Since you left'", () => {
		expect(noticeQueue({ plan: true, away: true, whatsNew: false })).toEqual(["plan", "away"]);
		expect(noticeQueue({ plan: false, away: false, whatsNew: true })).toEqual(["whats-new"]);
		expect(noticeQueue({ plan: true, away: true, whatsNew: true })).toEqual([
			"plan",
			"since-you-left",
		]);
		expect(noticeQueue({ plan: false, away: false, whatsNew: false })).toEqual([]);
	});

	it("shows the first unless he paged to one still due, and pages round", () => {
		const queue = noticeQueue({ plan: true, away: true, whatsNew: false });
		expect(shownNotice(queue, null)).toBe("plan");
		expect(shownNotice(queue, "away")).toBe("away");
		// The one he paged to was dismissed: back to the first.
		expect(shownNotice(["plan"], "away")).toBe("plan");
		expect(nextNotice(queue, "plan")).toBe("away");
		expect(nextNotice(queue, "away")).toBe("plan");
		expect(shownNotice([], null)).toBeNull();
	});
});
