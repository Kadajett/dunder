import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DayPlan } from "@shared/plan";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MORNING_PROMPT } from "./day-plan";
import { PlanService } from "./service";

const at = (day: number, hour: number, minute = 0) =>
	new Date(2026, 9, day, hour, minute).getTime();
const dirs: string[] = [];
const services: PlanService[] = [];
afterEach(() => {
	for (const service of services.splice(0)) service.stop();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness(dir = mkdtempSync(join(tmpdir(), "plan-"))) {
	dirs.push(dir);
	let now = at(7, 8, 0);
	const told: string[] = [];
	const emitted: (DayPlan | null)[] = [];
	const paths = {
		settingsPath: join(dir, "morning-plan.json"),
		plansDir: join(dir, "plans"),
		digestPath: join(dir, "state", "plan.json"),
		resultsPath: join(dir, "state", "plan-results.ndjson"),
	};
	const service = new PlanService({
		...paths,
		now: () => now,
		tellChief: async (text) => {
			told.push(text);
			return true;
		},
		morningContext: async () => " Yesterday's wrap-up proposed for today: 1) office-x: the cat.",
		chiefPane: () => "wN:p1",
		emit: (plan) => emitted.push(plan),
	});
	services.push(service);
	const propose = (plan: unknown, fromPane = "wN:p1") => {
		const id = crypto.randomUUID();
		const requestedAt = new Date(now).toISOString();
		void service.receive([
			JSON.stringify({ v: 1, id, fromPane, requestedAt, op: "propose", plan }),
		]);
		return id;
	};
	const answer = (id: string) =>
		readFileSync(paths.resultsPath, "utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line))
			.find((line) => line.id === id);
	return { dir, paths, service, told, emitted, propose, answer, at: (ms: number) => (now = ms) };
}

const plan = {
	focus: "Ship the morning plan",
	items: [{ bead: "office-4as.1", who: "carl", why: "the core" }],
	notToday: ["restyling"],
};

describe("the morning prompt", () => {
	it("asks Max once a day at the daily time, catches up within two hours, and skips later", async () => {
		const h = harness();
		writeFileSync(h.paths.settingsPath, JSON.stringify({ dailyTime: "09:00" }));
		await h.service.start();
		expect(h.told).toEqual([]);
		h.at(at(7, 9, 0));
		await h.service.check();
		await h.service.check();
		// Yesterday's wrap-up proposals ride along: tomorrow's plan starts from them.
		expect(h.told).toEqual([
			`${MORNING_PROMPT} Yesterday's wrap-up proposed for today: 1) office-x: the cat.`,
		]);
		// A launch at 10:30 the next day still asks; one at 11:30 the day after doesn't.
		h.at(at(8, 10, 30));
		await h.service.check();
		h.at(at(9, 11, 30));
		await h.service.check();
		expect(h.told).toHaveLength(2);
	});

	it("doesn't ask once Max has proposed today on his own", async () => {
		const h = harness();
		await h.service.start();
		const id = h.propose(plan);
		await vi.waitFor(() => expect(h.answer(id)).toMatchObject({ ok: true }));
		h.at(at(7, 9, 5));
		await h.service.check();
		expect(h.told.some((text) => text.startsWith(MORNING_PROMPT))).toBe(false);
	});
});

describe("office-plan propose and Jeremy's decision", () => {
	it("stores the chief's plan, refuses anyone else and invalid plans, and tells Max the decision once", async () => {
		const h = harness();
		await h.service.start();
		const stranger = h.propose(plan, "w1:p9");
		const invalid = h.propose({ focus: "", items: [] });
		const chief = h.propose(plan);
		await vi.waitFor(() => expect(h.answer(chief)).toMatchObject({ ok: true }));
		expect(h.answer(stranger)).toMatchObject({
			ok: false,
			message: expect.stringContaining("only the chief"),
		});
		expect(h.answer(invalid)).toMatchObject({
			ok: false,
			message: expect.stringContaining("focus"),
		});
		expect(h.service.today()).toMatchObject({
			state: "proposed",
			proposal: plan,
			goAheadAt: at(7, 9, 0),
		});
		expect(h.emitted.at(-1)?.state).toBe("proposed");
		expect(JSON.parse(readFileSync(h.paths.digestPath, "utf8")).plan.proposal).toEqual(plan);

		expect(await h.service.approve()).toEqual({ ok: true });
		expect(await h.service.approve()).toMatchObject({ ok: false });
		expect(h.told).toEqual(["[plan approved] go ahead"]);
		// Persisted: a restart reads today's decided plan back.
		const again = harness(h.dir);
		again.at(at(7, 8, 30));
		await again.service.start();
		expect(again.service.today()).toMatchObject({ state: "approved" });
	});

	it("goes ahead for Jeremy after an hour without a decision, telling Max once", async () => {
		const h = harness();
		await h.service.start();
		const id = h.propose(plan);
		await vi.waitFor(() => expect(h.answer(id)).toMatchObject({ ok: true }));
		h.at(at(7, 8, 59));
		await h.service.check();
		expect(h.service.today()?.state).toBe("proposed");
		h.at(at(7, 9, 0));
		await h.service.check();
		await h.service.check();
		expect(h.service.today()?.state).toBe("auto");
		expect(h.told.filter((text) => text.startsWith("[plan: no reply"))).toHaveLength(1);
	});
});
