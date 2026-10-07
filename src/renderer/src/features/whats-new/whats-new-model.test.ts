import type { WhatsNew, WhatsNewBead } from "@shared/whats-new";
import { describe, expect, it } from "vitest";
import { cardSections } from "./whats-new-model";

const bead = (n: number, type: string, tryIt: boolean, internal = false): WhatsNewBead => ({
	id: `office-${n}`,
	title: `Bead ${n}`,
	subject: `office-${n}: x`,
	tryIt: tryIt ? `try ${n}` : null,
	rating: null,
	type,
	internal,
});
const card = (beads: WhatsNewBead[], others: string[] = []): WhatsNew => ({
	built: "abc",
	recent: false,
	beads,
	others,
	ratingOff: null,
});

describe("cardSections", () => {
	it("16 beads, 8 with Try it: 3 to try (features first, then newest), 'Also changed (13)', internal ones under the hood", () => {
		// Newest first, as main sends them.
		const beads = [
			bead(1, "task", true),
			bead(2, "bug", true),
			bead(3, "feature", false),
			bead(4, "task", true),
			bead(5, "feature", true),
			bead(6, "bug", true),
			bead(7, "task", false, true),
			bead(8, "feature", true),
			bead(9, "task", true),
			bead(10, "task", true),
			...[11, 12, 13, 14, 15].map((n) => bead(n, "task", false)),
			bead(16, "task", false, true),
		];
		const sections = cardSections(card(beads));
		expect(sections.tryThese.map((each) => each.id)).toEqual(["office-5", "office-8", "office-2"]);
		expect(sections.alsoCount).toBe(13);
		expect(sections.underTheHood.map((each) => each.id)).toEqual(["office-7", "office-16"]);
		expect(sections.also).toHaveLength(11);
	});

	it("never offers an internal bead to try, and counts commits without a bead in 'Also changed'", () => {
		const sections = cardSections(card([bead(1, "feature", true, true)], ["Bump vite"]));
		expect(sections.tryThese).toEqual([]);
		expect(sections.alsoCount).toBe(2);
	});
});
