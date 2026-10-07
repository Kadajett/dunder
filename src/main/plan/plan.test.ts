import type { PlanProposal } from "@shared/plan";
import { describe, expect, it } from "vitest";
import { boardDigestPath } from "../../cli/office-board.mts";
import { planDigestPath, planRequestsPath, planResultsPath } from "../../cli/office-plan.mts";
import { approvePlan, discussPlan, editPlan, goAheadIfDue, proposePlan } from "./day-plan";
import { planDiff } from "./diff";
import {
	officePlanDigestPath,
	officePlanRequestsPath,
	officePlanResultsPath,
	parsePlanRequests,
} from "./requests";

const proposal: PlanProposal = {
	focus: "Ship the morning plan",
	items: [
		{ bead: "office-4as.1", who: "carl", why: "the core everything waits on" },
		{ bead: "office-4as.2", who: "theo", why: "the card Jeremy decides on" },
		{ bead: "office-x1y", who: "mika", why: "the cat" },
	],
	notToday: ["restyling agents"],
};

describe("plan request files", () => {
	it("are where the CLI writes and reads them", () => {
		const env = { XDG_STATE_HOME: "/s" };
		expect(officePlanRequestsPath(env, "/h")).toBe(planRequestsPath(env, "/h"));
		expect(officePlanResultsPath(env, "/h")).toBe(planResultsPath(env, "/h"));
		expect(officePlanDigestPath(env, "/h")).toBe(planDigestPath(env, "/h"));
		expect(officePlanDigestPath({}, "/h")).not.toBe(boardDigestPath({}, "/h"));
	});

	it("keeps valid recent proposals and answers invalid ones with zod's reason", () => {
		const now = Date.parse("2026-10-07T09:00:10Z");
		const line = (id: string, plan: unknown, requestedAt = "2026-10-07T09:00:00Z") =>
			JSON.stringify({ v: 1, id, fromPane: "wN:p1", requestedAt, op: "propose", plan });
		const tooMany = { ...proposal, items: Array.from({ length: 6 }, () => proposal.items[0]) };
		const { proposals, invalid } = parsePlanRequests(
			[
				line("id-valid-1", { focus: "Ship it", items: [] }),
				line("id-invalid", tooMany),
				line("id-stale-1", proposal, "2026-10-07T08:00:00Z"),
				"{ not json",
			],
			now,
		);
		expect(proposals).toEqual([
			{ id: "id-valid-1", fromPane: "wN:p1", plan: { focus: "Ship it", items: [], notToday: [] } },
		]);
		expect(invalid).toEqual([{ id: "id-invalid", error: expect.stringContaining("items") }]);
	});
});

describe("Jeremy's decisions", () => {
	const t0 = 1_000_000;
	const proposed = proposePlan("2026-10-07", proposal, t0, 60);

	it("approve once, telling Max to go ahead", () => {
		const step = approvePlan(proposed, t0 + 5);
		expect(step).toMatchObject({
			ok: true,
			plan: { state: "approved", decidedAt: t0 + 5, goAheadAt: null },
			tell: "[plan approved] go ahead",
		});
		expect(step.ok && approvePlan(step.plan, t0 + 6)).toEqual({
			ok: false,
			error: "today's plan is already approved",
		});
	});

	it("an edit tells Max exactly what changed", () => {
		const edit: PlanProposal = {
			focus: "Ship the plan card first",
			items: [
				{ bead: "office-4as.2", who: "carl", why: "the card Jeremy decides on" },
				{ bead: "office-4as.1", who: "carl", why: "the core everything waits on" },
			],
			notToday: [],
		};
		expect(planDiff(proposal, edit)).toEqual([
			"focus: Ship the plan card first",
			"removed office-x1y (mika)",
			"reassigned office-4as.2: theo → carl",
			"new order: office-4as.2, office-4as.1",
			"back on the table: restyling agents",
		]);
		const step = editPlan(proposed, edit, t0 + 9);
		expect(step).toMatchObject({ ok: true, plan: { state: "edited", edited: edit } });
		expect(step.ok && step.tell).toBe(`[plan edited] ${planDiff(proposal, edit).join("; ")}`);
	});

	it("goes ahead as proposed after the hour, unless decided or being discussed", () => {
		expect(goAheadIfDue(proposed, t0 + 60 * 60_000 - 1, 60)).toBeNull();
		expect(goAheadIfDue(proposed, t0 + 60 * 60_000, 60)).toMatchObject({
			ok: true,
			plan: { state: "auto" },
			tell: "[plan: no reply from Jeremy after 60 min] go ahead as proposed",
		});
		const talking = discussPlan(proposed);
		expect(talking.ok && goAheadIfDue(talking.plan, t0 + 3 * 60 * 60_000, 60)).toBeNull();
	});
});
