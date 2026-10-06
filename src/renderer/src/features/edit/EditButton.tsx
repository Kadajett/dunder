import "./edit.css";
import { useHud } from "../hud/view-store";
import { useEdit } from "./edit-store";

/** Top-bar toggle: enter edit mode (in the 3D office), or leave it discarding the draft. */
export function EditButton() {
	const editing = useEdit((state) => state.editing);
	const ready = useEdit((state) => state.base !== null);
	const setView = useHud((state) => state.setView);
	return (
		<button
			type="button"
			className="hud-chip edit-toggle"
			aria-pressed={editing}
			disabled={!ready}
			title={editing ? "Leave edit mode (discards unsaved changes)" : "Edit the office layout"}
			onClick={() => {
				const edit = useEdit.getState();
				if (edit.editing) {
					const dirty = edit.past.length > 0;
					if (!dirty || window.confirm("Discard unsaved layout changes?")) edit.cancel();
					return;
				}
				setView("office");
				edit.enter();
			}}
		>
			{editing ? "Exit edit" : "Edit"}
		</button>
	);
}
