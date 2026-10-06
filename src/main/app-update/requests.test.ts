import { describe, expect, it } from "vitest";
import * as runner from "../../cli/office-run.mts";
import { updateRequestsPath } from "../../cli/office-update.mts";
import { freshRequests, officeUpdateRequestsPath } from "./requests";
import * as supervisor from "./supervisor";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const line = (fields: Record<string, unknown>) =>
	JSON.stringify({
		v: 1,
		id: "0b6a3c1e-2f4d-4f7a-9a51-1f0c2b3d4e5f",
		fromPane: "w1:p3",
		reason: "new TV channels",
		requestedAt: "2026-10-06T11:59:50.000Z",
		...fields,
	});

describe("freshRequests", () => {
	it("keeps well-formed recent requests in order", () => {
		const requests = freshRequests([line({ reason: "a" }), line({ reason: "b" })], NOW);
		expect(requests.map((request) => request.reason)).toEqual(["a", "b"]);
		expect(requests[0]).toMatchObject({ fromPane: "w1:p3" });
	});

	it("accepts a request from outside an agent pane with no reason", () => {
		expect(freshRequests([line({ fromPane: undefined, reason: "" })], NOW)).toHaveLength(1);
	});

	it("drops malformed lines and unknown fields", () => {
		expect(freshRequests(["not json", "{}", line({ v: 2 }), line({ extra: true })], NOW)).toEqual(
			[],
		);
	});

	it("drops requests made more than ten minutes ago", () => {
		const stale = line({ requestedAt: "2026-10-06T11:49:59.000Z" });
		const recent = line({ requestedAt: "2026-10-06T11:50:01.000Z" });
		expect(freshRequests([stale, recent], NOW)).toHaveLength(1);
	});
});

describe("office-update CLI and app agree", () => {
	it.each([
		["the office-update CLI", updateRequestsPath],
		["the app", officeUpdateRequestsPath],
	])("%s honours XDG_STATE_HOME and falls back to ~/.local/state", (_who, path) => {
		expect(path({ XDG_STATE_HOME: "/s" }, "/home/j")).toBe("/s/dunder/update-requests.ndjson");
		expect(path({}, "/home/j")).toBe("/home/j/.local/state/dunder/update-requests.ndjson");
		expect(path({ XDG_STATE_HOME: "" }, "/home/j")).toBe(
			"/home/j/.local/state/dunder/update-requests.ndjson",
		);
	});

	it("the supervisor and the app share the relaunch contract", () => {
		expect(runner.RELAUNCH_EXIT_CODE).toBe(supervisor.RELAUNCH_EXIT_CODE);
		expect(runner.SUPERVISED_ENV).toBe(supervisor.SUPERVISED_ENV);
	});
});
