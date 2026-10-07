import { describe, expect, it } from "vitest";
import { beadsOfCommits } from "../main/whats-new/card";
import { type Bead, beadIdsOf, type Names, publicText, renderDraft } from "./office-notes.mts";

const names: Names = {
	agents: ["carl", "theo", "pip"],
	chief: "max",
	owner: "Jeremy",
	idPrefixes: ["office"],
};

const bead = (id: string, title: string, type: string, notes = ""): Bead => ({
	id,
	title,
	type,
	notes,
});

describe("office-notes: which beads a release has", () => {
	it("reads commit subjects the way the What's new card does", () => {
		const subjects = [
			"Merge bead/office-pab",
			"office-pab: inbox error cards lead with Tell Max",
			"Merge branch 'master' into bead/office-qp6",
			"office-qp6: rotate request files",
			"fix typo in README",
			"Merge bead/office-dk7.2 (pool engine)",
		];
		const card = beadsOfCommits(subjects.map((subject) => ({ sha: "h", subject })));
		const notes = beadIdsOf(subjects);
		expect(notes.ids).toEqual(card.beads.map((b) => b.id));
		expect(notes.unnamed).toBe(card.others.length);
	});
});

describe("office-notes: wording for outsiders", () => {
	it("strips bead ids, idea/audit prefixes and paths, and keeps ordinary hyphenated words", () => {
		const replaced = new Set<string>();
		expect(
			publicText(
				"HUD audit #5: one-command install (office-b5r) reads `src/main/app-update/service.ts`",
				names,
				replaced,
			),
		).toBe("One-command install reads");
		expect(
			publicText("idea: follow up on office-dk7.2 in docs/RELEASING.md", names, replaced),
		).toBe("Follow up on in");
	});

	it("swaps agents, the chief and the owner for roles, possessives included, and records each swap", () => {
		const replaced = new Set<string>();
		expect(
			publicText(
				"Princess Donut: a cat for Carl's desk; ask Max to plan Jeremy's day",
				names,
				replaced,
			),
		).toBe("Princess Donut: a cat for an agent's desk; ask your chief of staff to plan your day");
		expect([...replaced]).toEqual([
			'Jeremy → "you"',
			'max → "your chief of staff"',
			'carl → "an agent"',
		]);
		// Names only as whole words: "pipeline" is not pip.
		expect(publicText("Faster pipeline", names, new Set())).toBe("Faster pipeline");
	});
});

describe("office-notes: the draft", () => {
	const beads = [
		bead(
			"office-a",
			"Call your chief of staff from the dock",
			"feature",
			"x\nTry it: Press Call, then talk.",
		),
		bead("office-b", "Whiteboard goes white after a second", "bug"),
		bead("office-c", "Self-update runs npm install when needed", "task"),
		bead("office-d", "Pool night", "epic"),
		bead("office-e", "Quiet updates: hold until Jeremy isn't busy", "feature"),
		bead("office-f", "Faster boot", "feature", "Try it: open src/main/boot and time it"),
	];
	const draft = renderDraft({
		range: "v0.1.0..HEAD",
		beads,
		unknown: 2,
		unnamed: 3,
		names,
		today: "2026-10-07",
	});

	it("groups bullets into New, Fixed and Improved with Try it lines, leaving epics out", () => {
		const body = draft.slice(draft.indexOf("## What's new"));
		expect(body).toBe(
			[
				"## What's new",
				"",
				"### New",
				"",
				"- Call your chief of staff from the dock. Try it: Press Call, then talk.",
				"- Quiet updates: hold until you isn't busy",
				"- Faster boot. Try it: Open src/main/boot and time it",
				"",
				"### Fixed",
				"",
				"- Whiteboard goes white after a second",
				"",
				"### Improved",
				"",
				"- Self-update runs npm install when needed",
				"",
			].join("\n"),
		);
	});

	it("opens with a review checklist: it's a draft, what was swapped, lines to check, what was left out", () => {
		const header = draft.slice(0, draft.indexOf("-->"));
		expect(header).toContain("Nothing was published.");
		expect(header).toContain('- Replaced: Jeremy → "you"');
		expect(header).toContain(
			"- Check (grammar after naming you): Quiet updates: hold until you isn't busy",
		);
		expect(header).toContain(
			"- Check (looks internal): Faster boot. Try it: Open src/main/boot and time it",
		);
		expect(header).toContain(
			"- Left out: 1 epic(s), 2 bead(s) bd doesn't know, 3 commit(s) without a bead",
		);
	});

	it("says so when nothing user-facing shipped", () => {
		const empty = renderDraft({
			range: "v1..HEAD",
			beads: [],
			unknown: 0,
			unnamed: 1,
			names,
			today: "2026-10-07",
		});
		expect(empty).toContain("Nothing user-facing since the last release.");
	});
});
