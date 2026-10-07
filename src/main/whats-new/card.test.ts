import { describe, expect, it } from "vitest";
import { beadsOfCommits, planCard, tryItOf } from "./card";

const commits = (...subjects: string[]) =>
	subjects.map((subject, index) => ({ sha: `${index}`.padStart(7, "a"), subject }));

describe("beadsOfCommits", () => {
	it("names each bead once, newest first, preferring the engineer's subject over the merge line", () => {
		const found = beadsOfCommits(
			commits(
				"Merge bead/office-dk7.2 (pool engine)",
				"office-dk7.2: pool engine as pure data",
				"Merge bead/office-v4d",
				"office-v4d: Call Max from the dock",
				"office-v4d: fix the chime",
			),
		);
		expect(found.beads).toEqual([
			{ id: "office-dk7.2", subject: "office-dk7.2: pool engine as pure data" },
			{ id: "office-v4d", subject: "office-v4d: Call Max from the dock" },
		]);
		expect(found.others).toEqual([]);
	});

	it("keeps a merge line when it is the only commit of the bead, and does not mistake a longer id", () => {
		expect(
			beadsOfCommits(commits("Merge bead/office-snf.1 (Excalidraw)", "Merge bead/office-snf.10"))
				.beads,
		).toEqual([
			{ id: "office-snf.1", subject: "Merge bead/office-snf.1 (Excalidraw)" },
			{ id: "office-snf.10", subject: "Merge bead/office-snf.10" },
		]);
	});

	it("lists commits without a bead id as other changes, skipping branch plumbing", () => {
		const found = beadsOfCommits(
			commits(
				"Bump electron to 39",
				"Merge branch 'master' into bead/office-2z1",
				"Merge remote-tracking branch 'origin/master'",
				"docs: tidy the README",
			),
		);
		expect(found).toEqual({ beads: [], others: ["Bump electron to 39", "docs: tidy the README"] });
	});
});

describe("tryItOf", () => {
	it("takes the last Try it line, without the prefix", () => {
		const notes =
			"abc123 on bead/x\ntry it: an older hint\nVerified: tests.\nTry it:  open the dock and press the phone  ";
		expect(tryItOf(notes)).toBe("open the dock and press the phone");
	});

	it("is null without one (acceptance text is never used)", () => {
		expect(tryItOf("Shipped. Acceptance: the pool works.")).toBeNull();
		expect(tryItOf(undefined)).toBeNull();
		expect(tryItOf("Try it:")).toBeNull();
	});
});

describe("planCard", () => {
	it("shows nothing under dev, for the build already seen, or on the first launch ever", () => {
		expect(planCard(undefined, "abc", "ahead")).toEqual({ kind: "none" });
		expect(planCard("abc", "abc", "ahead")).toEqual({ kind: "none" });
		expect(planCard("abc", undefined, "apart")).toEqual({ kind: "first-launch" });
	});

	it("lists what is new since the last seen build, or recent commits when history was rewritten", () => {
		expect(planCard("new", "old", "ahead")).toEqual({ kind: "since", from: "old" });
		expect(planCard("new", "old", "apart")).toEqual({ kind: "recent" });
	});

	it("shows nothing after going back to an older build (a rollback): those commits aren't new", () => {
		expect(planCard("good", "bad", "behind")).toEqual({ kind: "none" });
	});
});
