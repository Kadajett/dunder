import { join } from "node:path";
import { type PlanProposal, planProposalSchema } from "@shared/plan";
import { z } from "zod";

type Env = Readonly<Record<string, string | undefined>>;

function stateDir(env: Env, home: string): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder");
}

/**
 * Must match `planRequestsPath` / `planResultsPath` / `planDigestPath` in
 * src/cli/office-plan.mts, which cannot import app code (it runs under plain
 * Node); requests.test.ts keeps them in step.
 */
export function officePlanRequestsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "plan-requests.ndjson");
}

export function officePlanResultsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "plan-results.ndjson");
}

/** Today's plan as JSON, for `office-plan show`. */
export function officePlanDigestPath(env: Env, home: string): string {
	return join(stateDir(env, home), "plan.json");
}

/** A request is answered only this soon after it was made (older ones were made while the app was closed). */
export const PLAN_REQUEST_MAX_AGE_MS = 60_000;

const lineSchema = z.object({
	v: z.literal(1),
	id: z.string().min(8).max(64),
	fromPane: z.string().min(1).max(64),
	requestedAt: z.iso.datetime(),
	op: z.literal("propose"),
	plan: z.unknown(),
});

export interface PlanRequest {
	readonly id: string;
	readonly fromPane: string;
	readonly plan: PlanProposal;
}

/** Recent `propose` lines: valid plans, and the ids of invalid ones with zod's reason. */
export function parsePlanRequests(
	lines: readonly string[],
	nowMs: number,
): {
	readonly proposals: PlanRequest[];
	readonly invalid: { readonly id: string; readonly error: string }[];
} {
	const proposals: PlanRequest[] = [];
	const invalid: { id: string; error: string }[] = [];
	for (const line of lines) {
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			continue;
		}
		const parsed = lineSchema.safeParse(json);
		if (!parsed.success || nowMs - Date.parse(parsed.data.requestedAt) > PLAN_REQUEST_MAX_AGE_MS)
			continue;
		const { id, fromPane } = parsed.data;
		const plan = planProposalSchema.safeParse(parsed.data.plan);
		if (plan.success) proposals.push({ id, fromPane, plan: plan.data });
		else invalid.push({ id, error: z.prettifyError(plan.error) });
	}
	return { proposals, invalid };
}
