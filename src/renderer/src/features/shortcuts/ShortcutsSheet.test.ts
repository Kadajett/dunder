import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isHelpShortcut, SHORTCUTS, type ShortcutGroup } from "../../shortcuts";
import { isMuteChord, MUTE_CHORD_LABEL } from "../chief/call/call-keys";
import { LEAVE_CHORD_LABEL } from "../office/focus/leave-keys";
import { channelForKey } from "../office/tv/channels";
import { type KeyLike, shortcutFor } from "../terminal/terminal-input";
import { ShortcutsSheetView } from "./ShortcutsSheet";

function listed(keys: string, group: ShortcutGroup): boolean {
	return SHORTCUTS.some((shortcut) => shortcut.keys === keys && shortcut.group === group);
}

function terminalKey(overrides: Partial<KeyLike>): KeyLike {
	return {
		type: "keydown",
		code: "",
		key: "",
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		metaKey: false,
		...overrides,
	};
}

describe("keyboard shortcuts", () => {
	it("keeps the call and TV shortcuts aligned with their handlers", () => {
		expect(
			isMuteChord({
				ctrlKey: true,
				shiftKey: true,
				altKey: false,
				metaKey: false,
				code: "Space",
			}),
		).toBe(true);
		expect(listed(MUTE_CHORD_LABEL, "Call")).toBe(true);
		for (const channelNumber of ["1", "2", "3", "4", "5"]) {
			expect(channelForKey(channelNumber)).not.toBeNull();
		}
		expect(listed("1–5", "TV")).toBe(true);
		expect(listed("← / →", "TV")).toBe(true);
	});
	it("opens only for the unmodified question mark key", () => {
		expect(isHelpShortcut({ key: "?", ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
		expect(isHelpShortcut({ key: "?", ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
		expect(isHelpShortcut({ key: "/", ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
	});

	it("keeps the leave-focus chord in the user-facing inventory", () => {
		expect(listed(LEAVE_CHORD_LABEL, "Everywhere")).toBe(true);
	});

	it("documents every terminal shortcut recognized by its handler", () => {
		const keys: readonly KeyLike[] = [
			terminalKey({ code: "KeyC", ctrlKey: true, shiftKey: true }),
			terminalKey({ code: "KeyV", ctrlKey: true, shiftKey: true }),
			terminalKey({ key: "Insert", shiftKey: true }),
			terminalKey({ key: "PageUp", shiftKey: true }),
			terminalKey({ key: "PageDown", shiftKey: true }),
		];
		const labels = [
			"Ctrl+Shift+C",
			"Ctrl+Shift+V",
			"Shift+Insert",
			"Shift+Page Up",
			"Shift+Page Down",
		];
		for (const [index, key] of keys.entries()) {
			expect(shortcutFor(key)).toBeDefined();
			expect(listed(labels[index] ?? "", "Terminal")).toBe(true);
		}
	});

	it("renders every shortcut group and key in the user-facing sheet", () => {
		const markup = renderToStaticMarkup(createElement(ShortcutsSheetView, { onClose: () => {} }));
		for (const group of ["Everywhere", "Terminal", "Call", "Edit mode", "TV", "Pool", "Dialogs"]) {
			expect(markup).toContain(group);
		}
		expect(markup).toContain("Ctrl+Shift+Space");
		expect(markup).toContain("Ctrl/Cmd+Enter");
		expect(markup).toContain("Press ? or Esc to close");
	});
});
