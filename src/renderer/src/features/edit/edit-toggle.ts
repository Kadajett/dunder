import { useHud } from "../hud/view-store";
import { useEdit } from "./edit-store";

/**
 * Enter edit mode (switching to the 3D office, where the layout is edited), or
 * leave it, confirming first when that discards unsaved changes.
 */
export function toggleEditMode(): void {
	const edit = useEdit.getState();
	if (edit.editing) {
		const dirty = edit.past.length > 0;
		if (!dirty || window.confirm("Discard unsaved layout changes?")) edit.cancel();
		return;
	}
	useHud.getState().setView("office");
	edit.enter();
}
