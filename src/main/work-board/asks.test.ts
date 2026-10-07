import { describe, expect, it } from "vitest";
import { buildAsks } from "./asks";
import { buildCards, parseBeads } from "./cards";

const open = parseBeads(
	JSON.stringify([
		{
			id: "o-b5r",
			title: "One-command install",
			status: "open",
			priority: 1,
			updated_at: "2026-10-06T10:00:00Z",
			dependencies: [{ depends_on_id: "o-ask1", type: "blocks" }],
		},
		{
			id: "o-ask1",
			title: "npm login + NPM_TOKEN secret",
			description: "Needed to publish",
			status: "open",
			priority: 1,
			assignee: "nora",
			labels: ["human"],
			created_at: "2026-10-06T09:00:00Z",
			updated_at: "2026-10-06T09:00:00Z",
		},
		{
			id: "o-ask2",
			title: "OK to spend on ElevenLabs?",
			status: "open",
			priority: 2,
			labels: ["human"],
			created_at: "2026-10-06T08:00:00Z",
			updated_at: "2026-10-06T08:00:00Z",
		},
	]),
);

describe("buildAsks", () => {
	it("lists human-labelled beads, most urgent first, with the work waiting on each and who asked", () => {
		expect(buildAsks(open)).toEqual([
			{
				id: "o-ask1",
				question: "npm login + NPM_TOKEN secret",
				detail: "Needed to publish",
				asker: "nora",
				blocks: [{ id: "o-b5r", title: "One-command install" }],
				createdAt: "2026-10-06T09:00:00Z",
			},
			expect.objectContaining({ id: "o-ask2", asker: null, blocks: [] }),
		]);
	});

	it("keeps asks off the board's lanes", () => {
		const ready = open;
		const cards = buildCards({ open, blocked: [], ready, closed: [] }, 0);
		expect(cards.map((card) => card.id)).toEqual(["o-b5r"]);
	});
});
