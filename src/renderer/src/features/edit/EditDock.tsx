import "./edit.css";
import { saveDraft } from "./edit-actions";
import { useEdit } from "./edit-store";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { useEditKeys } from "./useEditKeys";

function Toolbar() {
	const canUndo = useEdit((state) => state.past.length > 0);
	const canRedo = useEdit((state) => state.future.length > 0);
	const saving = useEdit((state) => state.saving);
	const status = useEdit((state) => state.status);
	const { undo, redo, cancel } = useEdit.getState();
	return (
		<section className="edit-section edit-toolbar" aria-label="Edit layout">
			<header className="edit-section-head">
				<strong>Editing layout</strong>
				<small>drag to move · R rotate · Del remove</small>
			</header>
			<div className="edit-actions">
				<button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
					Undo
				</button>
				<button type="button" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
					Redo
				</button>
				<span className="edit-actions-spacer" />
				<button type="button" onClick={cancel} disabled={saving}>
					Cancel
				</button>
				<button type="button" className="edit-primary" onClick={saveDraft} disabled={saving}>
					{saving ? "Saving…" : "Save"}
				</button>
			</div>
			{status ? (
				<p className="edit-status" data-tone={status.tone} role="status">
					{status.text}
				</p>
			) : null}
		</section>
	);
}

/** Edit mode's HUD: save/cancel/undo, the add palette and the inspector. */
export function EditDock() {
	const editing = useEdit((state) => state.editing);
	useEditKeys();
	if (!editing) return null;
	return (
		<aside className="edit-dock">
			<Toolbar />
			<Inspector />
			<Palette />
		</aside>
	);
}
