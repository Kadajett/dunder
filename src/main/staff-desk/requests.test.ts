import { STAFF_REQUEST_MAX_AGE_MS } from "@shared/staff";
import { describe, expect, it } from "vitest";
import { staffRequestsPath, staffResultsPath } from "../../cli/office-staff.mts";
import { officeStaffRequestsPath, officeStaffResultsPath, parseStaffRequests } from "./requests";

describe("staff requests", () => {
	it("reads and answers where office-staff writes and polls", () => {
		for (const env of [{}, { XDG_STATE_HOME: "/state" }]) {
			expect(officeStaffRequestsPath(env, "/home/j")).toBe(staffRequestsPath(env, "/home/j"));
			expect(officeStaffResultsPath(env, "/home/j")).toBe(staffResultsPath(env, "/home/j"));
		}
	});

	it("keeps fresh requests in order and drops stale ones (made while the app was closed)", () => {
		const now = Date.parse("2026-10-06T12:00:00Z");
		const at = (ms: number, name: string) =>
			JSON.stringify({
				v: 1,
				id: `request-${name}`,
				fromPane: "w9:p1",
				requestedAt: new Date(ms).toISOString(),
				request: { action: "restart", name },
			});
		const { requests, invalid } = parseStaffRequests(
			[
				at(now - STAFF_REQUEST_MAX_AGE_MS - 1, "old"),
				"not json",
				at(now - 1_000, "a"),
				at(now, "b"),
			],
			now,
		);
		expect(requests.map((r) => r.id)).toEqual(["request-a", "request-b"]);
		expect(invalid).toEqual([]);
	});
});
