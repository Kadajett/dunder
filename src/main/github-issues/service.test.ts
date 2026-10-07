import { describe, expect, it, vi } from "vitest";
import { IssueSync, type IssueSyncDeps } from "./service";

const issues = JSON.stringify([
	{ number: 7, title: "Crash", body: "", url: "https://github.com/o/r/issues/7", state: "OPEN" },
]);

function harness(extra: Partial<IssueSyncDeps> = {}) {
	const bdCalls: string[][] = [];
	const deps: IssueSyncDeps = {
		repo: async () => "o/r",
		listIssues: vi.fn(async () => issues),
		bd: async (args) => {
			bdCalls.push([...args]);
			return args[0] === "list" ? "[]" : "{}";
		},
		dryRun: false,
		changed: vi.fn(),
		setTimer: () => () => undefined,
		...extra,
	};
	return { sync: new IssueSync(deps), deps, bdCalls };
}

describe("IssueSync.pass", () => {
	it("reads the repo's issues, writes the missing bead and refreshes the board", async () => {
		const { sync, deps, bdCalls } = harness();
		const pass = await sync.pass();
		expect(deps.listIssues).toHaveBeenCalledWith("o/r");
		expect(bdCalls.map((args) => args[0])).toEqual(["list", "create"]);
		expect(pass.steps).toHaveLength(1);
		expect(deps.changed).toHaveBeenCalledOnce();
	});

	it("only reads bd on a dry run, and still says what it would write", async () => {
		const { sync, deps, bdCalls } = harness({ dryRun: true });
		const pass = await sync.pass();
		expect(bdCalls.map((args) => args[0])).toEqual(["list"]);
		expect(pass.steps.map((step) => step.kind)).toEqual(["create"]);
		expect(deps.changed).not.toHaveBeenCalled();
	});

	it("does nothing when the checkout isn't on GitHub", async () => {
		const { sync, deps, bdCalls } = harness({ repo: async () => null });
		expect(await sync.pass()).toEqual({ repo: null, steps: [] });
		expect(deps.listIssues).not.toHaveBeenCalled();
		expect(bdCalls).toEqual([]);
	});
});
