import { beforeEach, describe, expect, it } from "vitest";
import { type FocusTarget, useFocus } from "./focus-store";
import { leavesFocus } from "./leave-keys";

const table: FocusTarget = { kind: "table", table: { center: { x: -10, z: -3 }, angle: 0 } };
const screen: FocusTarget = {
	kind: "screen",
	deskId: "d1",
	paneId: "w1:p1",
	agentName: "nora",
	bracketedPaste: true,
	screen: { center: { x: 0, y: 1, z: 0 }, normal: { x: 0, z: 1 }, width: 0.8, height: 0.5 },
};
const rect = { left: 10, top: 20, width: 800, height: 400 };

beforeEach(() => useFocus.getState().returned());

describe("focus lifecycle", () => {
	it("takes the table through entering, focused, leaving and back to the overview", () => {
		const focus = useFocus.getState();
		focus.focus(table);
		expect(useFocus.getState()).toMatchObject({ target: table, phase: "entering", rect: null });
		focus.settled(rect);
		expect(useFocus.getState()).toMatchObject({ phase: "focused", rect });
		focus.leave();
		expect(useFocus.getState()).toMatchObject({ target: table, phase: "leaving", rect: null });
		// The camera finishing its tween back may report a settle late: it must not reopen the view.
		focus.settled(rect);
		expect(useFocus.getState().phase).toBe("leaving");
		focus.returned();
		expect(useFocus.getState()).toMatchObject({ target: null, phase: null, rect: null });
	});

	it("ignores a second target until the first one has fully returned", () => {
		const focus = useFocus.getState();
		focus.focus(table);
		focus.focus(screen);
		expect(useFocus.getState().target).toBe(table);
		focus.leave();
		focus.focus(screen);
		expect(useFocus.getState().target).toBe(table);
		focus.returned();
		focus.focus(screen);
		expect(useFocus.getState()).toMatchObject({ target: screen, phase: "entering" });
	});
});

describe("leave keys", () => {
	const key = (
		key: string,
		mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {},
	) => ({
		key,
		code: key === "o" || key === "O" ? "KeyO" : key,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		...mods,
	});

	it("leaves the pool table on Esc, but never a screen (its terminal needs Esc)", () => {
		expect(leavesFocus("table", key("Escape"))).toBe(true);
		expect(leavesFocus("screen", key("Escape"))).toBe(false);
	});

	it("leaves either on Ctrl+Shift+O, and on nothing else", () => {
		const chord = key("O", { ctrlKey: true, shiftKey: true });
		expect(leavesFocus("table", chord)).toBe(true);
		expect(leavesFocus("screen", chord)).toBe(true);
		expect(leavesFocus("screen", { ...chord, altKey: true })).toBe(false);
		expect(leavesFocus("table", key("O", { ctrlKey: true }))).toBe(false);
	});
});
