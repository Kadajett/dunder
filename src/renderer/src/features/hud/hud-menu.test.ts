import { describe, expect, it } from "vitest";
import { type MenuState, menuSections, updateBadge } from "./hud-menu";

const BASE: MenuState = {
	panel: null,
	view: "office",
	editing: false,
	editReady: true,
	brainstorming: false,
};

const entries = (state: MenuState) => menuSections(state).flatMap((section) => section.entries);
const checked = (state: MenuState) =>
	entries(state)
		.filter((entry) => entry.checked)
		.map((entry) => entry.label);

describe("menuSections", () => {
	it("holds every former top-bar action except the inbox, plus the whiteboard and brainstorms", () => {
		expect(entries(BASE).map((entry) => entry.action)).toEqual([
			{ kind: "panel", panel: "clients" },
			{ kind: "panel", panel: "brain" },
			{ kind: "panel", panel: "team" },
			{ kind: "whiteboard" },
			{ kind: "brainstorm" },
			{ kind: "view", view: "office" },
			{ kind: "view", view: "classic" },
			{ kind: "edit" },
		]);
	});

	it("offers to end a running brainstorm instead of starting one", () => {
		const brainstorm = (state: MenuState) =>
			entries(state).find((entry) => entry.action.kind === "brainstorm")?.label;
		expect(brainstorm(BASE)).toBe("Start brainstorm…");
		expect(brainstorm({ ...BASE, brainstorming: true })).toBe("End brainstorm");
	});

	it("checks the open panel and the current view", () => {
		expect(checked(BASE)).toEqual(["Office"]);
		expect(checked({ ...BASE, panel: "brain", view: "classic" })).toEqual(["Brain", "Classic"]);
		// The inbox opens from the bar, so no menu panel shows as open.
		expect(checked({ ...BASE, panel: "inbox" })).toEqual(["Office"]);
	});

	it("offers to leave edit mode while editing, and disables entering until a layout loads", () => {
		const edit = (state: MenuState) => entries(state).find((entry) => entry.action.kind === "edit");
		expect(edit(BASE)).toMatchObject({ label: "Edit layout" });
		expect(edit(BASE)?.disabled).toBeUndefined();
		expect(edit({ ...BASE, editReady: false })).toMatchObject({ disabled: true });
		expect(edit({ ...BASE, editing: true })).toMatchObject({
			label: "Exit edit",
			hint: "discards unsaved changes",
		});
	});
});

describe("updateBadge", () => {
	const behind = { head: "abc1234", commits: [], behind: 2 };

	it("marks the menu only when an update needs attention", () => {
		expect(updateBadge({ state: "dev" })).toBeNull();
		expect(updateBadge({ state: "idle", head: "abc1234" })).toBeNull();
		expect(updateBadge({ state: "available", ...behind })).toBe("available");
		expect(updateBadge({ state: "building", logTail: "" })).toBe("building");
		expect(updateBadge({ state: "failed", error: "tsc", logTail: "", ...behind })).toBe("failed");
	});
});
