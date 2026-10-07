import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import { noteActivity, withActivity } from "./activity";
import type { Bead } from "./cards";

const T0 = Date.parse("2026-10-07T09:00:00Z");
const bead = (over: Partial<Bead> = {}): Bead => ({
	id: "office-a",
	title: "a",
	status: "in_progress",
	priority: 2,
	issue_type: "task",
	updated_at: "2026-10-07T09:00:00Z",
	...over,
});
const card = (over: Partial<WorkCard> = {}): WorkCard => ({
	id: "office-a",
	title: "a",
	priority: 2,
	lane: "in_progress",
	assignee: "carl",
	epic: null,
	waitingOn: [],
	description: "",
	acceptance: "",
	updatedAt: "2026-10-07T09:00:00Z",
	startedAt: "2026-10-07T06:00:00Z",
	spend: null,
	epicSpend: null,
	...over,
});

describe("label and comment activity on in-progress beads", () => {
	it("counts a first-seen bead from its last update, and a new label or comment from when it's noticed", () => {
		const first = noteActivity(new Map(), [bead()], T0 + 60_000);
		expect(first.get("office-a")?.at).toBe(T0);
		// Nothing changed: the time stays.
		expect(noteActivity(first, [bead()], T0 + 120_000).get("office-a")?.at).toBe(T0);
		const labelled = noteActivity(first, [bead({ labels: ["blocked-on-jeremy"] })], T0 + 3_600_000);
		expect(labelled.get("office-a")?.at).toBe(T0 + 3_600_000);
		const commented = noteActivity(
			labelled,
			[bead({ labels: ["blocked-on-jeremy"], comment_count: 1 })],
			T0 + 7_200_000,
		);
		expect(commented.get("office-a")?.at).toBe(T0 + 7_200_000);
		// The same labels in another order are no change.
		const reordered = noteActivity(
			noteActivity(new Map(), [bead({ labels: ["a", "b"] })], T0),
			[bead({ labels: ["b", "a"] })],
			T0 + 1,
		);
		expect(reordered.get("office-a")?.at).toBe(T0);
	});

	it("forgets beads that leave In progress", () => {
		const seen = noteActivity(new Map(), [bead()], T0);
		expect(noteActivity(seen, [bead({ status: "open" })], T0 + 1).has("office-a")).toBe(false);
	});

	it("moves an in-progress card's updatedAt to its latest activity, never back, and leaves other lanes alone", () => {
		const activity = new Map([["office-a", { key: "x#1", at: T0 + 3_600_000 }]]);
		expect(withActivity([card()], activity)[0]?.updatedAt).toBe("2026-10-07T10:00:00.000Z");
		const newer = card({ updatedAt: "2026-10-07T11:00:00Z" });
		expect(withActivity([newer], activity)[0]).toBe(newer);
		const review = card({ lane: "review" });
		expect(withActivity([review], activity)[0]).toBe(review);
	});
});
