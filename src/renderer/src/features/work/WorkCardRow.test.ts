import { WORK_STALE_AGE_MS, WORK_STALE_QUIET_MS, type WorkCard } from "@shared/work-board";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkCardRow } from "./WorkCardRow";

const card: WorkCard = {
	id: "office-123",
	title: "Investigate the stuck task",
	priority: 2,
	lane: "in_progress",
	assignee: null,
	epic: null,
	waitingOn: [],
	description: "",
	acceptance: "",
	updatedAt: new Date(Date.now() - WORK_STALE_QUIET_MS - 5 * 60_000).toISOString(),
	startedAt: new Date(Date.now() - WORK_STALE_AGE_MS - 5 * 60_000).toISOString(),
	spend: null,
	epicSpend: null,
};

describe("WorkCardRow stale age", () => {
	it("renders the in-progress duration and amber tooltip with both ages", () => {
		const markup = renderToStaticMarkup(
			createElement(WorkCardRow, {
				card,
				expanded: false,
				onToggle: vi.fn(),
				onDrag: vi.fn(),
			}),
		);

		expect(markup).toContain('class="work-card__age work-card__age--stale"');
		expect(markup).toContain("for 2 h");
		expect(markup).toMatch(/title="In progress 2 h [0-9]+ m, last bead update [0-9]+ min ago"/);
	});
});
