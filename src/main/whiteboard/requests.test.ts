import { describe, expect, it } from "vitest";
import { boardDigestPath, boardRequestsPath } from "../../cli/office-board.mts";
import { officeBoardDigestPath, officeBoardRequestsPath, parseBoardRequests } from "./requests";

describe("office-board CLI and app agree", () => {
	it.each([
		["requests", boardRequestsPath, officeBoardRequestsPath, "board-requests.ndjson"],
		["digest", boardDigestPath, officeBoardDigestPath, "board.json"],
	])("on the %s path, with and without XDG_STATE_HOME", (_what, cli, app, file) => {
		for (const env of [{ XDG_STATE_HOME: "/s" }, {}, { XDG_STATE_HOME: "" }]) {
			expect(cli(env, "/home/j")).toBe(app(env, "/home/j"));
		}
		expect(app({ XDG_STATE_HOME: "/s" }, "/home/j")).toBe(`/s/dunder/${file}`);
		expect(app({}, "/home/j")).toBe(`/home/j/.local/state/dunder/${file}`);
	});
});

describe("parseBoardRequests", () => {
	const note = {
		v: 1,
		id: "0b6a3c1e-2f4d-4f7a-9a51-1f0c2b3d4e5f",
		fromPane: "w1:p3",
		op: "note",
		text: "ship it",
		requestedAt: "2026-10-06T11:59:50.000Z",
	};

	it("keeps well-formed requests in order and skips everything else", () => {
		const lines = [
			JSON.stringify(note),
			"not json",
			JSON.stringify({ ...note, op: "erase" }),
			JSON.stringify({ ...note, extra: true }),
			JSON.stringify({ ...note, text: "   " }),
			JSON.stringify({ ...note, fromPane: undefined }),
			JSON.stringify({ ...note, op: "clear", text: undefined }),
		];
		expect(parseBoardRequests(lines).map((request) => request.op)).toEqual(["note", "clear"]);
	});
});
