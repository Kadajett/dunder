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

/** Today's wrap-up as JSON, for `office-plan show`. */
export function officeWrapDigestPath(env: Env, home: string): string {
	return join(stateDir(env, home), "wrap.json");
}

/** A request is answered only this soon after it was made (older ones were made while the app was closed). */
export const PLAN_REQUEST_MAX_AGE_MS = 60_000;

/** One `office-plan` request line: the plan for `propose`, the wrap-up for `wrap`. */
const lineSchema = z.object({
	v: z.literal(1),
	id: z.string().min(8).max(64),
	fromPane: z.string().min(1).max(64),
	requestedAt: z.iso.datetime(),
	op: z.enum(["propose", "wrap"]),
	plan: z.unknown().optional(),
	wrap: z.unknown().optional(),
});

export interface OfficePlanRequest<T> {
	readonly id: string;
	readonly fromPane: string;
	readonly body: T;
}

export interface ParsedRequests<T> {
	readonly valid: OfficePlanRequest<T>[];
	/** Recent requests of this op whose body failed `schema`, with zod's reason. */
	readonly invalid: { readonly id: string; readonly error: string }[];
}

/** Recent `op` lines: those whose body passes `schema`, and the ids of the rest with the reason. */
export function parseOfficePlanRequests<T>(
	lines: readonly string[],
	nowMs: number,
	op: "propose" | "wrap",
	schema: z.ZodType<T>,
): ParsedRequests<T> {
	const valid: OfficePlanRequest<T>[] = [];
	const invalid: { id: string; error: string }[] = [];
	for (const line of lines) {
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			continue;
		}
		const parsed = lineSchema.safeParse(json);
		if (!parsed.success || parsed.data.op !== op) continue;
		if (nowMs - Date.parse(parsed.data.requestedAt) > PLAN_REQUEST_MAX_AGE_MS) continue;
		const { id, fromPane } = parsed.data;
		const body = schema.safeParse(op === "propose" ? parsed.data.plan : parsed.data.wrap);
		if (body.success) valid.push({ id, fromPane, body: body.data });
		else invalid.push({ id, error: z.prettifyError(body.error) });
	}
	return { valid, invalid };
}

/** Recent `propose` lines (see `parseOfficePlanRequests`). */
export function parsePlanRequests(
	lines: readonly string[],
	nowMs: number,
): ParsedRequests<PlanProposal> {
	return parseOfficePlanRequests(lines, nowMs, "propose", planProposalSchema);
}
