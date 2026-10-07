import { describe, expect, it } from "vitest";
import {
	type GhIssue,
	githubRepoOf,
	type IssueBead,
	issueDescription,
	planIssueSync,
} from "./issues";

const issue = (number: number, extra: Partial<GhIssue> = {}): GhIssue => ({
	number,
	title: `Crash ${number}`,
	body: "It crashes",
	url: `https://github.com/Kadajett/dunder/issues/${number}`,
	state: "OPEN",
	author: { login: "someone" },
	labels: [{ name: "office" }],
	...extra,
});
const bead = (of: GhIssue, extra: Partial<IssueBead> = {}): IssueBead => ({
	id: `office-${of.number}`,
	title: `${of.title} (#${of.number})`,
	description: issueDescription(of),
	status: "open",
	external_ref: of.url,
	...extra,
});

describe("planIssueSync", () => {
	it("makes a bead for each open issue without one: labelled github, linked by URL, a bug when labelled bug", () => {
		const steps = planIssueSync(
			[issue(1, { labels: [{ name: "office" }, { name: "bug" }] }), issue(2)],
			[],
		);
		expect(steps.map((step) => step.kind)).toEqual(["create", "create"]);
		expect(steps[0]?.args).toEqual([
			"create",
			"--title=Crash 1 (#1)",
			`--description=It crashes\n\n---\nFrom GitHub by @someone: ${issue(1).url} "Crash 1"`,
			"--type=bug",
			"--priority=2",
			"--labels=github",
			`--external-ref=${issue(1).url}`,
		]);
		expect(steps[1]?.args).toContain("--type=task");
	});

	it("never makes a bead twice, nor one for an issue closed before the office saw it", () => {
		const seen = issue(1);
		expect(planIssueSync([seen, issue(2, { state: "CLOSED" })], [bead(seen)])).toEqual([]);
	});

	it("refreshes an open bead when its issue changed, keeping the office's own retitle otherwise", () => {
		const before = issue(1);
		const after = issue(1, { body: "It crashes on start" });
		const retitled = bead(before, { title: "Fix the start crash" });
		expect(planIssueSync([before], [retitled])).toEqual([]);
		expect(planIssueSync([after], [retitled])[0]?.args).toEqual([
			"update",
			"office-1",
			"--title=Crash 1 (#1)",
			`--description=${issueDescription(after)}`,
		]);
		expect(planIssueSync([after], [bead(before, { status: "closed" })])).toEqual([]);
	});
});

describe("githubRepoOf", () => {
	it("reads owner/repo from https and ssh remotes, null otherwise", () => {
		expect(githubRepoOf("https://github.com/Kadajett/dunder.git\n")).toBe("Kadajett/dunder");
		expect(githubRepoOf("git@github.com:Kadajett/dunder.git")).toBe("Kadajett/dunder");
		expect(githubRepoOf("https://github.com/Kadajett/dunder")).toBe("Kadajett/dunder");
		expect(githubRepoOf("https://gitlab.com/a/b.git")).toBeNull();
	});
});
