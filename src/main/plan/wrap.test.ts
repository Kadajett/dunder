import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DayPlan } from "@shared/plan";
import type { WorkBoard, WorkCard, WorkLane } from "@shared/work-board";
import type { DayWrap } from "@shared/wrap";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dayFacts, morningContext } from "./wrap";
import { WrapService } from "./wrap-service";

const at = (day: number, hour: number, minute = 0) =>
	new Date(2026, 9, day, hour, minute).getTime();

const card = (id: string, lane: WorkLane): WorkCard => ({
	id,
	title: `title of ${id}`,
	priority: 2,
	lane,
	assignee: null,
	epic: null,
	waitingOn: [],
	description: "",
	acceptance: "",
	updatedAt: "2026-10-07T12:00:00Z",
	startedAt: null,
	spend: null,
	epicSpend: null,
});

const board: WorkBoard = {
	state: "ok",
	revision: 1,
	cards: [card("office-a", "review"), card("office-b", "blocked")],
	asks: [],
};

const plan = (date: string): DayPlan => ({
	date,
	proposal: {
		focus: "Ship the day",
		items: [
			{ bead: "office-a", who: "carl", why: "a" },
			{ bead: "office-b", who: "theo", why: "b" },
			{ bead: "office-c", who: "mika", why: "c" },
			{ bead: "office-gone", who: "raina", why: "d" },
		],
		notToday: [],
	},
	proposedAt: at(7, 9),
	state: "approved",
	decidedAt: at(7, 9, 5),
	edited: null,
	goAheadAt: null,
});

const closed = [
	{ id: "office-c", title: "C shipped" },
	{ id: "office-x", title: "Unplanned fix" },
];

describe("the day's facts", () => {
	it("gives each planned item its lane now (done when closed today) and lists what shipped outside the plan", () => {
		const tries = { offered: 3, rated: 1, untried: 1 };
		const facts = dayFacts(plan("2026-10-07"), board, closed, { spendUsd: 12.5, tries });
		expect(facts.planned).toEqual([
			{ bead: "office-a", who: "carl", title: "title of office-a", lane: "review" },
			{ bead: "office-b", who: "theo", title: "title of office-b", lane: "blocked" },
			{ bead: "office-c", who: "mika", title: "C shipped", lane: "done" },
			{ bead: "office-gone", who: "raina", title: null, lane: null },
		]);
		expect(facts.unplanned).toEqual([{ id: "office-x", title: "Unplanned fix" }]);
		// A day without a plan: everything closed is unplanned.
		expect(
			dayFacts(null, { state: "unavailable", reason: "bd" }, closed, {
				spendUsd: null,
				tries: null,
			}),
		).toEqual({ planned: [], unplanned: closed, spendUsd: null, tries: null });
	});

	it("hands the next morning yesterday's proposals, and nothing without a wrap-up", () => {
		const wrap = {
			input: { tomorrow: [{ bead: "office-b", what: "unblock B" }, { what: "triage" }] },
		};
		expect(morningContext(wrap as DayWrap)).toBe(
			" Yesterday's wrap-up proposed for today: 1) office-b: unblock B; 2) triage. Start from these.",
		);
		expect(morningContext(null)).toBe("");
	});
});

const dirs: string[] = [];
const services: WrapService[] = [];
afterEach(() => {
	for (const service of services.splice(0)) service.stop();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness(dir = mkdtempSync(join(tmpdir(), "wrap-"))) {
	dirs.push(dir);
	let now = at(7, 17, 0);
	let callLive = false;
	const told: { text: string; call: boolean }[] = [];
	const emitted: (DayWrap | null)[] = [];
	const paths = {
		statePath: join(dir, "evening-wrap.json"),
		plansDir: join(dir, "plans"),
		digestPath: join(dir, "state", "wrap.json"),
		resultsPath: join(dir, "state", "plan-results.ndjson"),
	};
	const service = new WrapService({
		...paths,
		now: () => now,
		tellChief: async (text, call) => {
			told.push({ text, call });
			return true;
		},
		callLive: () => callLive,
		chiefPane: () => "wN:p1",
		plan: () => plan("2026-10-07"),
		board: async () => board,
		closedSince: async () => closed,
		spendToday: () => 12.5,
		tryCounts: async () => ({ offered: 3, rated: 1, untried: 1 }),
		emit: (wrap) => emitted.push(wrap),
	});
	services.push(service);
	const send = (wrap: unknown, fromPane = "wN:p1") => {
		const id = crypto.randomUUID();
		const requestedAt = new Date(now).toISOString();
		void service.receive([JSON.stringify({ v: 1, id, fromPane, requestedAt, op: "wrap", wrap })]);
		return id;
	};
	const answer = (id: string) =>
		readFileSync(paths.resultsPath, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line))
			.find((line) => line.id === id);
	return {
		paths,
		service,
		told,
		emitted,
		send,
		answer,
		at: (ms: number) => (now = ms),
		onCall: (live: boolean) => (callLive = live),
	};
}

const wrap = {
	summary: "A and C moved; B is stuck on the API key.",
	misses: [{ bead: "office-b", why: "waiting on Jeremy's API key" }],
	tomorrow: [{ bead: "office-b", what: "unblock B first" }],
};

describe("the evening prompt", () => {
	it("asks Max once at the evening time with the day's facts, catches up within two hours, and skips later", async () => {
		const h = harness();
		writeFileSync(h.paths.statePath, JSON.stringify({ eveningTime: "18:00" }));
		await h.service.start();
		expect(h.told).toEqual([]);
		h.at(at(7, 18, 0));
		await h.service.check();
		await h.service.check();
		expect(h.told).toHaveLength(1);
		expect(h.told[0]?.call).toBe(false);
		expect(h.told[0]?.text).toContain(
			"Planned: office-a (carl) in review; office-b (theo) blocked; office-c (mika) done; office-gone (raina) not on the board.",
		);
		expect(h.told[0]?.text).toContain("Shipped outside the plan: office-x.");
		expect(h.told[0]?.text).toContain("AI spend today ~$12.50.");
		expect(h.told[0]?.text).toContain("Try these today: 3 offered, 1 rated, 1 not tried.");
		h.at(at(8, 19, 30));
		await h.service.check();
		h.at(at(9, 20, 30));
		await h.service.check();
		expect(h.told).toHaveLength(2);
	});

	it("asks as a call turn while Jeremy is on a call with Max, so the wrap-up is spoken", async () => {
		const h = harness();
		await h.service.start();
		h.onCall(true);
		h.at(at(7, 18, 1));
		await h.service.check();
		expect(h.told.map((told) => told.call)).toEqual([true]);
	});

	it("doesn't ask once Max has wrapped up today on his own", async () => {
		const h = harness();
		await h.service.start();
		const id = h.send(wrap);
		await vi.waitFor(() => expect(h.answer(id)).toMatchObject({ ok: true }));
		h.at(at(7, 18, 5));
		await h.service.check();
		expect(h.told).toEqual([]);
	});
});

describe("office-plan wrap and Jeremy's notice", () => {
	it("stores the chief's wrap-up with the facts joined in, refusing anyone else and invalid ones", async () => {
		const h = harness();
		await h.service.start();
		const stranger = h.send(wrap, "w1:p9");
		const invalid = h.send({ summary: "x", tomorrow: [] });
		const valid = h.send(wrap);
		await vi.waitFor(() => expect(h.answer(valid)).toMatchObject({ ok: true }));
		expect(h.answer(stranger)).toMatchObject({
			ok: false,
			message: expect.stringContaining("only the chief"),
		});
		expect(h.answer(invalid)).toMatchObject({
			ok: false,
			message: expect.stringContaining("tomorrow"),
		});
		const today = h.service.today();
		expect(today).toMatchObject({
			date: "2026-10-07",
			input: wrap,
			unplanned: [{ id: "office-x", title: "Unplanned fix" }],
			spendUsd: 12.5,
			tries: { offered: 3, rated: 1, untried: 1 },
			dismissed: false,
		});
		expect(today?.planned.map((item) => item.lane)).toEqual(["review", "blocked", "done", null]);
		expect(h.emitted.at(-1)).toEqual(today);
		expect(JSON.parse(readFileSync(h.paths.digestPath, "utf8"))).toEqual({
			date: "2026-10-07",
			wrap: today,
		});
	});

	it("keeps the notice closed across a restart, and starts the next day empty", async () => {
		const first = harness();
		await first.service.start();
		const id = first.send(wrap);
		await vi.waitFor(() => expect(first.answer(id)).toMatchObject({ ok: true }));
		await first.service.dismiss();
		first.service.stop();
		const dir = join(first.paths.plansDir, "..");
		const second = harness(dir);
		await second.service.start();
		expect(second.service.today()).toMatchObject({ dismissed: true, input: wrap });
		second.at(at(8, 8, 0));
		await second.service.check();
		expect(second.service.today()).toBeNull();
		expect(second.emitted.at(-1)).toBeNull();
	});
});
