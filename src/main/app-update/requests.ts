import { join } from "node:path";
import {
	UPDATE_REQUEST_MAX_AGE_MS,
	type UpdateRequestLine,
	updateRequestLineSchema,
} from "@shared/app-update";

/**
 * Must match `updateRequestsPath` in src/cli/office-update.mts, which cannot
 * import app code (it runs under plain Node); requests.test.ts keeps them in step.
 */
export function officeUpdateRequestsPath(
	env: Readonly<Record<string, string | undefined>>,
	home: string,
): string {
	const state = env["XDG_STATE_HOME"] || join(home, ".local", "state");
	return join(state, "dunder", "update-requests.ndjson");
}

/**
 * The requests worth acting on among newly appended lines: well-formed and
 * recent (a request made while the app was closed is stale by the time it opens).
 */
export function freshRequests(lines: readonly string[], nowMs: number): UpdateRequestLine[] {
	const requests: UpdateRequestLine[] = [];
	for (const line of lines) {
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			continue;
		}
		const parsed = updateRequestLineSchema.safeParse(json);
		if (!parsed.success) continue;
		const age = nowMs - Date.parse(parsed.data.requestedAt);
		if (age <= UPDATE_REQUEST_MAX_AGE_MS) requests.push(parsed.data);
	}
	return requests;
}
