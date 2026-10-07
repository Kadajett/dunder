import { create } from "zustand";

export type ShortcutGroup =
	| "Everywhere"
	| "Terminal"
	| "Call"
	| "Edit mode"
	| "TV"
	| "Pool"
	| "Dialogs";

export interface ShortcutDescription {
	readonly keys: string;
	readonly action: string;
	readonly group: ShortcutGroup;
}

/** User-facing inventory; handlers stay with the feature that owns each key. */
export const SHORTCUTS: readonly ShortcutDescription[] = [
	{ keys: "Ctrl+Shift+O", action: "Leave the focused screen or pool table", group: "Everywhere" },
	{ keys: "?", action: "Open this shortcut sheet", group: "Everywhere" },
	{ keys: "Ctrl+Shift+I", action: "Open devtools", group: "Everywhere" },
	{ keys: "Ctrl+Shift+C", action: "Copy terminal selection", group: "Terminal" },
	{ keys: "Ctrl+Shift+V", action: "Paste into the terminal", group: "Terminal" },
	{ keys: "Shift+Insert", action: "Paste into the terminal", group: "Terminal" },
	{ keys: "Shift+Page Up", action: "Scroll terminal history up", group: "Terminal" },
	{ keys: "Shift+Page Down", action: "Scroll terminal history down", group: "Terminal" },
	{ keys: "Ctrl+Shift+Space", action: "Mute or unmute the call microphone", group: "Call" },
	{ keys: "Ctrl/Cmd+Z", action: "Undo", group: "Edit mode" },
	{ keys: "Ctrl/Cmd+Shift+Z", action: "Redo", group: "Edit mode" },
	{ keys: "Ctrl/Cmd+Y", action: "Redo", group: "Edit mode" },
	{ keys: "R", action: "Rotate the selected item clockwise", group: "Edit mode" },
	{ keys: "Shift+R", action: "Rotate the selected item counterclockwise", group: "Edit mode" },
	{ keys: "Delete / Backspace", action: "Delete the selected item", group: "Edit mode" },
	{ keys: "Esc", action: "Deselect the selected item", group: "Edit mode" },
	{ keys: "1–5", action: "Choose a TV channel", group: "TV" },
	{ keys: "← / →", action: "Switch TV channels", group: "TV" },
	{ keys: "Esc", action: "Close the TV", group: "TV" },
	{ keys: "Esc", action: "Leave the pool table", group: "Pool" },
	{ keys: "Ctrl/Cmd+Enter", action: "Send an answer to an ask", group: "Dialogs" },
	{ keys: "Esc", action: "Close or cancel a dialog", group: "Dialogs" },
];

interface ShortcutSheetState {
	readonly open: boolean;
	setOpen(open: boolean): void;
}

export const useShortcutSheet = create<ShortcutSheetState>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
}));

export function isHelpShortcut(
	event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
): boolean {
	return event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return (
		target.isContentEditable ||
		target.closest("[data-own-keys]") !== null ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
	);
}
