import { join } from "node:path";
import {
	STAFF_REQUEST_MAX_AGE_MS,
	type StaffRequestLine,
	staffRequestLineSchema,
} from "@shared/staff";
import { z } from "zod";

type Env = Readonly<Record<string, string | undefined>>;

function stateDir(env: Env, home: string): string {
	return join(env["XDG_STATE_HOME"] || join(home, ".local", "state"), "dunder");
}

/**
 * Must match `staffRequestsPath` / `staffResultsPath` in src/cli/office-staff.mts,
 * which cannot import app code (it runs under plain Node); requests.test.ts keeps them in step.
 */
export function officeStaffRequestsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "staff-requests.ndjson");
}

export function officeStaffResultsPath(env: Env, home: string): string {
	return join(stateDir(env, home), "staff-results.ndjson");
}

export interface ParsedRequests {
	readonly requests: readonly StaffRequestLine[];
	/** Recognisable requests (they carry an id) that failed validation, to answer with the reason. */
	readonly invalid: readonly { readonly id: string; readonly error: string }[];
}

const idOnly = z.object({ id: z.string().min(8).max(64) });

/**
 * The requests worth acting on among newly appended lines, in order: well-formed
 * and recent (a request made while the app was closed is stale by the time it opens).
 */
export function parseStaffRequests(lines: readonly string[], nowMs: number): ParsedRequests {
	const requests: StaffRequestLine[] = [];
	const invalid: { id: string; error: string }[] = [];
	for (const line of lines) {
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			continue;
		}
		const parsed = staffRequestLineSchema.safeParse(json);
		if (!parsed.success) {
			const id = idOnly.safeParse(json).data?.id;
			const issue = parsed.error.issues[0];
			const field = issue?.path.filter((key) => key !== "request").join(".") || "request";
			if (id) invalid.push({ id, error: `${field}: ${issue?.message ?? "invalid"}` });
			continue;
		}
		if (nowMs - Date.parse(parsed.data.requestedAt) <= STAFF_REQUEST_MAX_AGE_MS) {
			requests.push(parsed.data);
		}
	}
	return { requests, invalid };
}
