import type { WorkCard } from "@shared/work-board";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentBeads } from "./agent-beads";

function card(id: string, assignee: string | null, lane: WorkCard["lane"]): WorkCard {
	return {
		id,
		title: id,
		priority: 2,
		lane,
		assignee,
		epic: null,
		waitingOn: [],
		description: `Description for ${id}`,
		acceptance: `Acceptance for ${id}`,
		updatedAt: "",
		spend: null,
		epicSpend: null,
	};
}

describe("AgentBeads", () => {
	it("shows only assigned in-progress beads with descriptions and acceptance", () => {
		const markup = renderToStaticMarkup(
			createElement(AgentBeads, {
				agentName: "nora",
				cards: [
					card("office-1", "nora", "in_progress"),
					card("office-2", "nora", "ready"),
					card("office-3", "max", "in_progress"),
				],
			}),
		);

		expect(markup).toContain("office-1");
		expect(markup).toContain("Description for office-1");
		expect(markup).toContain("Acceptance for office-1");
		expect(markup).not.toContain("office-2");
		expect(markup).not.toContain("office-3");
	});

	it("shows no bead only when the board is available and has no matching work", () => {
		expect(
			renderToStaticMarkup(
				createElement(AgentBeads, {
					agentName: "nora",
					cards: [card("office-1", null, "in_progress")],
				}),
			),
		).toContain("No bead.");
		expect(
			renderToStaticMarkup(createElement(AgentBeads, { agentName: "nora", cards: undefined })),
		).toContain("Bead data unavailable.");
	});
});
