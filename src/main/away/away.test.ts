import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AWAY_MS, type AwaySummary } from "@shared/away";
import { beforeEach, describe, expect, it } from "vitest";
import { AwayService } from "./service";
import { type AwayFacts, absenceStart, awaySummary, isBack } from "./summary";

const H = 3_600_000;
const T0 = Date.parse("2026-10-07T18:00:00Z");
const facts: AwayFacts = {
	closed: [{ id: "office-1vd", title: "Review lane" }],
	asks: 1,
	updates: 3,
	spendUsd: 12.345,
};
const none: AwayFacts = { closed: [], asks: 0, updates: 0, spendUsd: null };

describe("absence", () => {
	it("starts when the window loses focus, or after 2 h idle at a focused window", () => {
		expect(absenceStart(null, { focused: false, idleMs: 0, now: T0 })).toBe(T0);
		expect(absenceStart(null, { focused: true, idleMs: AWAY_MS - 1, now: T0 })).toBeNull();
		expect(absenceStart(null, { focused: true, idleMs: AWAY_MS, now: T0 })).toBe(T0 - AWAY_MS);
		expect(
			absenceStart({ awayAt: T0 - H, build: null }, { focused: false, idleMs: 0, now: T0 }),
		).toBe(T0 - H);
	});

	it("ends when the window has focus and the machine just had input", () => {
		expect(isBack({ focused: true, idleMs: 5_000 })).toBe(true);
		expect(isBack({ focused: true, idleMs: AWAY_MS })).toBe(false);
		expect(isBack({ focused: false, idleMs: 0 })).toBe(false);
	});
});

describe("awaySummary", () => {
	it("sums up an absence of 2 h or more, spend to the cent", () => {
		expect(awaySummary(T0, T0 + 2 * H, facts)).toEqual({
			awayAt: T0,
			backAt: T0 + 2 * H,
			...facts,
			spendUsd: 12.35,
		});
	});

	it("is nothing under 2 h, or when nothing happened", () => {
		expect(awaySummary(T0, T0 + 2 * H - 1, facts)).toBeNull();
		expect(awaySummary(T0, T0 + 5 * H, none)).toBeNull();
		expect(awaySummary(T0, T0 + 5 * H, { ...none, spendUsd: 0.001 })).toBeNull();
	});

	it("keeps an overnight absence's spend as one total across midnight", () => {
		const evening = Date.parse("2026-10-07T22:00:00");
		const morning = Date.parse("2026-10-08T08:30:00");
		expect(awaySummary(evening, morning, { ...none, spendUsd: 40 })).toMatchObject({
			spendUsd: 40,
		});
	});
});

describe("AwayService", () => {
	let statePath: string;
	beforeEach(async () => {
		statePath = join(await mkdtemp(join(tmpdir(), "away-")), "away.json");
	});

	function harness(build: string | null = "b2") {
		const clock = { now: T0, focused: true, idleMs: 0 };
		const emitted: AwaySummary[] = [];
		const asked: [number, number, string | null][] = [];
		const make = () =>
			new AwayService({
				statePath,
				now: () => clock.now,
				focused: () => clock.focused,
				idleMs: () => clock.idleMs,
				build,
				facts: async (awayAt, now, fromBuild) => {
					asked.push([awayAt, now, fromBuild]);
					return facts;
				},
				emit: (summary) => emitted.push(summary),
			});
		return { clock, emitted, asked, make };
	}

	it("sums up a long absence on return, with the build he left on, and keeps it until dismissed", async () => {
		const h = harness();
		const away = h.make();
		h.clock.focused = false;
		await away.check();
		h.clock.now = T0 + 3 * H;
		h.clock.focused = true;
		await away.check();
		expect(h.asked).toEqual([[T0, T0 + 3 * H, "b2"]]);
		expect(h.emitted).toHaveLength(1);
		expect(away.get()).toMatchObject({ awayAt: T0, closed: facts.closed });
		away.dismiss();
		expect(away.get()).toBeNull();
	});

	it("says nothing after a short absence", async () => {
		const h = harness();
		const away = h.make();
		h.clock.focused = false;
		await away.check();
		h.clock.now = T0 + H;
		h.clock.focused = true;
		await away.check();
		expect(h.emitted).toEqual([]);
	});

	it("counts 2 h idle at a focused window as away", async () => {
		const h = harness();
		const away = h.make();
		h.clock.now = T0 + 2.5 * H;
		h.clock.idleMs = 2.5 * H;
		await away.check();
		h.clock.now += 60_000;
		h.clock.idleMs = 0;
		await away.check();
		expect(h.asked[0]?.[0]).toBe(T0);
		expect(h.emitted).toHaveLength(1);
	});

	it("remembers the absence across a relaunch (an update applied while he was away)", async () => {
		const before = harness("b1");
		before.clock.focused = false;
		await before.make().check();
		const after = harness("b2");
		after.clock.now = T0 + 4 * H;
		const relaunched = after.make();
		await relaunched.check();
		expect(after.asked).toEqual([[T0, T0 + 4 * H, "b1"]]);
	});
});
