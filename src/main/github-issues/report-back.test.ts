import { describe, expect, it } from "vitest";
import { commitsByBead, planReportBack } from "./report-back";

const issue = (number: number, state: string) => ({
	number,
	title: `issue ${number}`,
	url: `https://github.com/o/r/issues/${number}`,
	state,
});
const bead = (id: string, number: number, status: string) => ({
	id,
	title: "internal title",
	description: "internal description",
	status,
	external_ref: `https://github.com/o/r/issues/${number}`,
	notes: "internal notes",
});

describe("which fixed issues to close", () => {
	it("finds the newest commit naming each bead (Max's merge or the engineer's commit)", () => {
		const log = [
			"m1\x1fMerge bead/office-a1",
			"c1\x1foffice-a1: the fix",
			"c2\x1foffice-b2: another",
			"c3\x1fchore: tidy",
		].join("\n");
		expect(commitsByBead(log)).toEqual(
			new Map([
				["office-a1", "m1"],
				["office-b2", "c2"],
			]),
		);
	});

	it("closes only closed beads whose issue is still open and a commit names, with no bead text but the try-it line", () => {
		const plan = planReportBack(
			"o/r",
			[issue(1, "OPEN"), issue(2, "OPEN"), issue(3, "CLOSED"), issue(4, "OPEN")],
			[
				bead("office-a1", 1, "closed"),
				bead("office-b2", 2, "in_progress"),
				bead("office-c3", 3, "closed"),
				bead("office-d4", 4, "closed"),
			],
			new Map([
				["office-a1", "sha1aaaaaaa"],
				["office-b2", "sha2"],
				["office-c3", "sha3"],
			]),
		);
		expect(plan).toEqual([
			{
				bead: "office-a1",
				number: 1,
				url: "https://github.com/o/r/issues/1",
				text: "Fixed in sha1aaa (https://github.com/o/r/commit/sha1aaaaaaa).",
			},
		]);
		expect(JSON.stringify(plan)).not.toMatch(/internal/);
	});
});
