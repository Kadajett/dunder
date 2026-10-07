import { describe, expect, it, vi } from "vitest";
import { IssueSync, type IssueSyncDeps } from "./service";

const URL7 = "https://github.com/o/r/issues/7";
const issues = JSON.stringify([{ number: 7, title: "Crash", body: "", url: URL7, state: "OPEN" }]);
/** The bead made from issue 7, fixed and closed, with internal notes only its try-it line may leave. */
const fixedBead = JSON.stringify([
	{
		id: "office-x1",
		title: "Crash on launch (#7)",
		description: "max says otto broke it in src/main/secret.ts",
		status: "closed",
		external_ref: URL7,
		notes: "INTERNAL: costs $40, ask jeremy\nTry it: Open the app twice",
	},
]);
const SHA = "abc1234def5678";

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
		reportBack: async () => false,
		commits: async () => new Map(),
		closeIssue: vi.fn(async () => undefined),
		...extra,
	};
	return { sync: new IssueSync(deps), deps, bdCalls };
}

const withFixedBead = (extra: Partial<IssueSyncDeps> = {}) =>
	harness({
		bd: async (args) => (args[0] === "list" ? fixedBead : "{}"),
		commits: async () => new Map([["office-x1", SHA]]),
		...extra,
	});

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
		expect(await sync.pass()).toEqual({ repo: null, steps: [], closed: [] });
		expect(deps.listIssues).not.toHaveBeenCalled();
		expect(bdCalls).toEqual([]);
	});
});

describe("report-back", () => {
	it("is off by default: a fixed issue stays open and nothing is sent", async () => {
		const { sync, deps } = withFixedBead();
		expect((await sync.pass()).closed).toEqual([]);
		expect(deps.closeIssue).not.toHaveBeenCalled();
	});

	it("when on, closes the fixed issue with only the commit and the try-it line", async () => {
		const { sync, deps } = withFixedBead({ reportBack: async () => true });
		const pass = await sync.pass();
		const text = `Fixed in abc1234 (https://github.com/o/r/commit/${SHA}).\n\nTry it: Open the app twice`;
		expect(deps.closeIssue).toHaveBeenCalledExactlyOnceWith("o/r", 7, text);
		expect(pass.closed.map((close) => close.number)).toEqual([7]);
	});

	it("leaves an issue alone when no commit names its bead (closed without a fix)", async () => {
		const { sync, deps } = withFixedBead({
			reportBack: async () => true,
			commits: async () => new Map(),
		});
		await sync.pass();
		expect(deps.closeIssue).not.toHaveBeenCalled();
	});

	it("sends nothing on a dry run, and a failed close is retried on the next pass", async () => {
		const dry = withFixedBead({ reportBack: async () => true, dryRun: true });
		expect((await dry.sync.pass()).closed).toHaveLength(1);
		expect(dry.deps.closeIssue).not.toHaveBeenCalled();
		const closeIssue = vi
			.fn<IssueSyncDeps["closeIssue"]>()
			.mockRejectedValueOnce(new Error("gh: HTTP 502"))
			.mockResolvedValue(undefined);
		const flaky = withFixedBead({ reportBack: async () => true, closeIssue });
		expect((await flaky.sync.pass()).closed).toEqual([]);
		expect((await flaky.sync.pass()).closed).toHaveLength(1);
	});
});
