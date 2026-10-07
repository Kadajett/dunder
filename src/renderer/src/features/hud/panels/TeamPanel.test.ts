import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveAgent } from "../../office/model/live-agents";
import type { OfficeModel } from "../../office/model/office-model";
import { TeamPanel } from "./TeamPanel";

const agent = {
	name: "otto",
	paneId: "pane-1",
	workspaceLabel: undefined,
	status: "working",
	kind: "omp",
} satisfies LiveAgent;

const model: OfficeModel = { agents: [agent], seated: [] };

function renderTeam(): string {
	return renderToStaticMarkup(createElement(TeamPanel, { model }));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("TeamPanel agent actions", () => {
	it("keeps Open screen visible and groups the other actions in a closed overflow panel", () => {
		vi.stubGlobal("window", { office: { models: {} } });
		const markup = renderTeam();
		const screenAction = markup.indexOf(">Open screen</button>");
		const moreAction = markup.indexOf('aria-label="More actions for otto"');
		const menuStart = markup.indexOf('class="team-card-more__panel"');
		const cardEnd = menuStart < 0 ? -1 : markup.indexOf("</article>", menuStart);
		const menu = menuStart < 0 || cardEnd < 0 ? "" : markup.slice(menuStart, cardEnd);

		expect(screenAction).toBeGreaterThanOrEqual(0);
		expect(moreAction).toBeGreaterThan(screenAction);
		expect(markup).toContain('aria-expanded="false"');
		expect(menu).toContain('hidden=""');
		expect(menu).toContain("Beads");
		expect(menu).toContain("Open in editor");
		expect(menu).toContain("Switch model");
		expect(menu).toContain("Interrupt");
	});
});
