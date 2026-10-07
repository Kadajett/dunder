import { createLogger } from "@shared/log/logger";
import type { DayPlan, PlanApi, PlanProposal, PlanResult } from "@shared/plan";
import { create } from "zustand";
import { planCardDue } from "./plan-model";

const log = createLogger("plan");

interface PlanStoreState {
	readonly plan: DayPlan | null;
	/** Main has answered, so cards that queue behind the plan card can show. */
	readonly settled: boolean;
	/** Why the last decision didn't go through, until the next one. */
	readonly error: string | null;
	readonly busy: boolean;
}

export const usePlan = create<PlanStoreState>(() => ({
	plan: null,
	settled: false,
	error: null,
	busy: false,
}));

const api = () => ("plan" in window.office ? window.office.plan : null);
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Follow today's plan; returns the cleanup. A main process without the plan yet just shows nothing. */
export function connectPlan(): () => void {
	const plan = api();
	if (!plan) {
		usePlan.setState({ settled: true });
		return () => undefined;
	}
	void plan
		.today()
		.then((today) => usePlan.setState({ plan: today, settled: true }))
		.catch((error: unknown) => {
			log.warn("no plan today", { error });
			usePlan.setState({ settled: true });
		});
	return plan.onChanged((today) => usePlan.setState({ plan: today, settled: true }));
}

async function decide(send: (plan: PlanApi) => Promise<PlanResult>): Promise<boolean> {
	const plan = api();
	if (!plan) return false;
	usePlan.setState({ busy: true, error: null });
	const result = await send(plan).catch((error: unknown) => ({
		ok: false as const,
		reason: reasonOf(error),
	}));
	usePlan.setState({ busy: false, error: result.ok ? null : result.reason });
	return result.ok;
}

export const approvePlan = () => decide((plan) => plan.approve());
export const editPlan = (edited: PlanProposal) => decide((plan) => plan.edit(edited));
export const discussPlan = () => decide((plan) => plan.discuss());

/** The plan card is (or may be) showing: What's new and the Away card wait behind it. */
export function usePlanCardPending(): boolean {
	return usePlan((state) => !state.settled || planCardDue(state.plan));
}
