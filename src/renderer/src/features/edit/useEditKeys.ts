import { deleteItem, rotateItem } from "@shared/layout/ops";
import { useEffect } from "react";
import { type EditState, useEdit } from "./edit-store";

/** Typing in a field, or in a layer that handles its own keys (`data-own-keys`, e.g. the whiteboard). */
function typingIn(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.closest("[data-own-keys]")) return true;
	return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo. Returns whether it handled the key. */
function historyKey(event: KeyboardEvent, key: string, edit: EditState): boolean {
	if (!(event.ctrlKey || event.metaKey) || (key !== "z" && key !== "y")) return false;
	event.preventDefault();
	if (key === "y" || event.shiftKey) edit.redo();
	else edit.undo();
	return true;
}

/** Keys acting on the selected item. */
const ITEM_KEYS: Record<string, (edit: EditState, event: KeyboardEvent) => void> = {
	escape: (edit) => edit.select(null),
	r: (edit, event) => {
		if (edit.draft && edit.selected)
			edit.apply(rotateItem(edit.draft, edit.selected, event.shiftKey ? -1 : 1));
	},
	delete: removeSelected,
	backspace: removeSelected,
};

function removeSelected(edit: EditState): void {
	if (!edit.draft || !edit.selected) return;
	edit.apply(deleteItem(edit.draft, edit.selected));
	edit.select(null);
}

function onKey(event: KeyboardEvent): void {
	const edit = useEdit.getState();
	if (typingIn(event.target) || !edit.editing || !edit.draft) return;
	const key = event.key.toLowerCase();
	if (historyKey(event, key, edit)) return;
	const action = ITEM_KEYS[key];
	if (!action || !edit.selected || event.ctrlKey || event.metaKey || event.altKey) return;
	event.preventDefault();
	action(edit, event);
}

/** Edit-mode keys: R / Shift+R rotate, Delete removes, Esc deselects, Ctrl+Z / Ctrl+Shift+Z undo and redo. */
export function useEditKeys(): void {
	useEffect(() => {
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
}
