import type { DayPlan, PlanProposal } from "@shared/plan";
import type { DayWrap } from "@shared/wrap";

export function makeQaFixtures(now: number, state: string | null) {
	const proposal: PlanProposal = {
		focus: "Ship the critical work",
		items: [{ bead: "office-k2p.3", who: "theo", why: "Close repeat-error grouping" }],
		notToday: ["Polish the pool table"],
	};
	let plan: DayPlan | null = ["13-plan-proposed", "13-plan-edit"].includes(state ?? "")
		? {
				date: "2026-10-07",
				proposal,
				proposedAt: now,
				state: "proposed",
				decidedAt: null,
				edited: null,
				goAheadAt: now + 60 * 60_000,
			}
		: null;
	const listeners = new Set<(value: DayPlan | null) => void>();
	const wrap: DayWrap | null =
		state === "14-day-end"
			? {
					date: "2026-10-07",
					postedAt: now,
					input: {
						summary: "Repeat-error grouping shipped; one planned item remains blocked.",
						misses: [{ bead: "office-k2p.3", why: "Needs review" }],
						tomorrow: [{ bead: "office-k2p.3", what: "Finish the review" }],
					},
					planned: [
						{ bead: "office-k2p.3", who: "theo", title: "Group repeat errors", lane: "review" },
					],
					unplanned: [{ id: "office-7bm", title: "Line up agents for the scene shot" }],
					spendUsd: 12.35,
					dismissed: false,
				}
			: null;
	return {
		plan: () => plan,
		wrap,
		onPlanChanged: (listener: (value: DayPlan | null) => void) => {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},
		setPlan: (value: DayPlan) => {
			plan = value;
			for (const listener of listeners) listener(value);
		},
	};
}
