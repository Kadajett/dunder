import type { WorkCard } from "@shared/work-board";
import { describe, expect, it } from "vitest";
import type { Bead } from "./cards";
import { median, noteReview, shippingStats, withReviewSince } from "./shipping";

const HOUR = 60 * 60 * 1000;
/** 15:00 local on a day; midnight is 15 h before. */
const now = new Date(2026, 9, 7, 15, 0, 0).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

const bead = (id: string, closedAgo: number, extra: Partial<Bead> = {}): Bead =>
	({
		id,
		title: id,
		status: "closed",
		priority: 2,
		issue_type: "task",
		assignee: "theo",
		closed_at: iso(now - closedAgo),
		started_at: iso(now - closedAgo - 2 * HOUR),
		updated_at: iso(now - closedAgo),
		created_at: iso(now - closedAgo - 3 * HOUR),
		...extra,
	}) as Bead;
const card = (id: string, lane: WorkCard["lane"], updatedAgo = 0) =>
	({ id, lane, updatedAt: iso(now - updatedAgo) }) as WorkCard;

describe("shippingStats", () => {
	it("counts today's closes against yesterday's (local days), leaving epics and asks out, with today's medians", () => {
		const closed = [
			bead("a", 1 * HOUR),
			bead("b", 3 * HOUR, { started_at: iso(now - 7 * HOUR) }),
			bead("c", 5 * HOUR, { started_at: iso(now - 11 * HOUR) }),
			bead("epic", 1 * HOUR, { issue_type: "epic" }),
			bead("ask", 1 * HOUR, { labels: ["human"] }),
			bead("y1", 16 * HOUR),
			bead("y2", 30 * HOUR),
			bead("old", 40 * HOUR),
		];
		const reviewSince = new Map([
			["a", now - 1.5 * HOUR],
			["b", now - 5 * HOUR],
		]);
		const spendOf = (_agent: string, from: number, to: number) => (to - from) / HOUR;
		const cards = [card("r1", "review"), card("r2", "review"), card("q", "ready")];
		expect(shippingStats({ closed, cards, reviewSince, spendOf, now })).toEqual({
			today: 3,
			yesterday: 2,
			leadMs: 4 * HOUR,
			reviewMs: 1.25 * HOUR,
			usd: 4,
			ready: 1,
			inReview: 2,
		});
	});

	it("has no medians on a day with nothing closed yet", () => {
		const stats = shippingStats({
			closed: [bead("y", 20 * HOUR)],
			cards: [],
			reviewSince: new Map(),
			spendOf: () => null,
			now,
		});
		expect(stats).toMatchObject({
			today: 0,
			yesterday: 1,
			leadMs: null,
			reviewMs: null,
			usd: null,
		});
	});
});

describe("noteReview", () => {
	it("notes a bead entering Review, keeps it once closed, and forgets it when sent back", () => {
		const first = noteReview(
			new Map(),
			[card("a", "review", 2 * HOUR), card("b", "in_progress")],
			now,
		);
		expect([...first]).toEqual([["a", now - 2 * HOUR]]);
		const later = noteReview(first, [card("a", "done"), card("b", "review", 0)], now + HOUR);
		expect([...later]).toEqual([
			["a", now - 2 * HOUR],
			["b", now],
		]);
		expect([...noteReview(later, [card("b", "in_progress")], now + 2 * HOUR)]).toEqual([
			["a", now - 2 * HOUR],
		]);
	});
});

describe("median", () => {
	it("takes the middle value, or the mean of the two middle ones", () => {
		expect(median([5, 1, 3])).toBe(3);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([])).toBeNull();
	});
});

describe("withReviewSince", () => {
	it("keeps a Review card's entry time when a notes edit moves its last update, and falls back to that update when unknown", () => {
		const since = noteReview(new Map(), [card("a", "review", 2 * HOUR)], now);
		// An hour later someone edits a's notes: updated_at is now, the wait isn't.
		const later = [card("a", "review", 0), card("b", "review", HOUR), card("c", "ready")];
		const shown = withReviewSince(later, noteReview(since, later, now));
		expect(shown.map((each) => each.reviewSince)).toEqual([
			iso(now - 2 * HOUR),
			iso(now - HOUR),
			undefined,
		]);
		expect(withReviewSince([card("d", "review", HOUR)], new Map())[0]?.reviewSince).toBe(
			iso(now - HOUR),
		);
	});
});
