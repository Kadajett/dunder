import type { WhatsNewBead } from "@shared/whats-new";
import { describe, expect, it } from "vitest";
import { noteOffered, tryCounts, unratedToday, withTryRating } from "./tries";

const bead = (id: string, over: Partial<WhatsNewBead> = {}): WhatsNewBead => ({
	id,
	title: `title ${id}`,
	subject: `${id}: subject`,
	tryIt: `try ${id}`,
	rating: null,
	type: "feature",
	internal: false,
	...over,
});

describe("today's 'Try these'", () => {
	it("remembers each day's offers across builds, keeping a bead's first time and its rating", () => {
		const morning = noteOffered({}, "2026-10-07", [bead("office-a"), bead("office-b")], 1_000);
		const rated = withTryRating(morning, "office-a", "up");
		// A later build offers office-a again plus office-c: a stays rated and keeps its time.
		const later = noteOffered(rated, "2026-10-07", [bead("office-a"), bead("office-c")], 5_000);
		expect(later["2026-10-07"]).toEqual({
			"office-a": { title: "title office-a", tryIt: "try office-a", at: 1_000, rating: "up" },
			"office-b": { title: "title office-b", tryIt: "try office-b", at: 1_000, rating: null },
			"office-c": { title: "title office-c", tryIt: "try office-c", at: 5_000, rating: null },
		});
	});

	it("keeps 14 days and drops older ones", () => {
		const old = noteOffered({}, "2026-09-23", [bead("office-old")], 1);
		const kept = noteOffered(old, "2026-10-06", [bead("office-k")], 2);
		expect(Object.keys(kept).sort()).toEqual(["2026-09-23", "2026-10-06"]);
		expect(Object.keys(noteOffered(kept, "2026-10-07", [], 3)).sort()).toEqual([
			"2026-10-06",
			"2026-10-07",
		]);
	});

	it("asks about at most 3 unrated ones, newest first; a rated or untried one never comes back", () => {
		const day = "2026-10-07";
		let tried = noteOffered({}, day, [bead("office-a")], 1);
		tried = noteOffered(tried, day, [bead("office-b"), bead("office-c")], 2);
		tried = noteOffered(tried, day, [bead("office-d")], 3);
		expect(unratedToday(tried, day).map((row) => row.id)).toEqual([
			"office-d",
			"office-b",
			"office-c",
		]);
		tried = withTryRating(withTryRating(tried, "office-d", "untried"), "office-b", "down");
		expect(unratedToday(tried, day).map((row) => row.id)).toEqual(["office-c", "office-a"]);
		expect(tryCounts(tried, day)).toEqual({ offered: 4, rated: 1, untried: 1 });
		expect(unratedToday(tried, "2026-10-08")).toEqual([]);
	});
});
