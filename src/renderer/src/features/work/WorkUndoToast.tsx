import { useEffect } from "react";
import { undoLast } from "./work-store";
import { dropToast, type ShownToast, UNDO_MS, useWorkUndo } from "./work-undo";
import "./work-undo.css";

/**
 * The foot of the work bar after one of Jeremy's board writes: what changed
 * and Undo, for `UNDO_MS`. A newer write replaces it; it stays while an undo
 * runs, and says so when one fails.
 */
export function WorkUndoToast() {
	const toast = useWorkUndo((state) => state.toast);
	const seq = toast?.seq;
	const running = toast?.state === "undoing";
	useEffect(() => {
		if (seq === undefined || running) return;
		const timer = window.setTimeout(() => dropToast(seq), UNDO_MS);
		return () => window.clearTimeout(timer);
	}, [seq, running]);
	if (!toast) return null;
	return (
		<div className="work-undo" role="status" data-state={toast.state}>
			<span className="work-undo__label">{text(toast)}</span>
			{toast.state === "offered" || toast.state === "undoing" ? (
				<button
					type="button"
					className="work-undo__button"
					disabled={running}
					onClick={() => void undoLast()}
				>
					{running ? "Undoing…" : "Undo"}
				</button>
			) : null}
		</div>
	);
}

function text(toast: ShownToast): string {
	switch (toast.state) {
		case "failed":
			return `Couldn't undo (${toast.label}): ${toast.reason}`;
		case "added":
			return `${toast.label} · no undo: close it from ⋯`;
		default:
			return toast.label;
	}
}
