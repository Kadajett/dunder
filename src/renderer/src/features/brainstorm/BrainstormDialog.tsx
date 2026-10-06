import "../office/interaction/cards.css";
import "./brainstorm.css";
import { BRAINSTORM_TOPIC_MAX } from "@shared/brainstorm";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { startBrainstorm } from "./brainstorm-store";

/** Whether the "start a brainstorm" dialog is open (the HUD menu opens it). */
export const useBrainstormDialog = create<{ readonly open: boolean; setOpen(open: boolean): void }>(
	(set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

function TopicForm({ onClose }: { readonly onClose: () => void }) {
	const [topic, setTopic] = useState("");
	const [error, setError] = useState<string | undefined>();
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);
	const submit = (): void => {
		setBusy(true);
		startBrainstorm(topic.trim()).then(onClose, (reason: unknown) => {
			setBusy(false);
			setError(reason instanceof Error ? reason.message : String(reason));
		});
	};
	return (
		<form
			className="brainstorm-dialog"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<header>
				<strong>START A BRAINSTORM</strong>
				<button type="button" className="card-close" onClick={onClose} aria-label="Close">
					×
				</button>
			</header>
			<label>
				<span>Topic</span>
				<input
					// biome-ignore lint/a11y/noAutofocus: the dialog exists to type this one field.
					autoFocus
					value={topic}
					maxLength={BRAINSTORM_TOPIC_MAX}
					placeholder="e.g. Q4 launch: what do we ship first?"
					onChange={(event) => setTopic(event.target.value)}
				/>
			</label>
			<p className="brainstorm-hint">
				Everyone walks to the whiteboard and posts sticky notes on it as soon as they are free.
			</p>
			{error ? <p className="brainstorm-error">{error}</p> : null}
			<footer>
				<button type="button" className="brainstorm-cancel" onClick={onClose}>
					Cancel
				</button>
				<button type="submit" className="card-action" disabled={!topic.trim() || busy}>
					{busy ? "Starting…" : "Gather everyone"}
				</button>
			</footer>
		</form>
	);
}

/** The HUD's way to start a brainstorm: one topic field. Mount once. */
export function BrainstormDialog() {
	const open = useBrainstormDialog((state) => state.open);
	const setOpen = useBrainstormDialog((state) => state.setOpen);
	if (!open) return null;
	const close = (): void => setOpen(false);
	return (
		<div className="brainstorm-overlay">
			<button type="button" className="brainstorm-backdrop" aria-label="Close" onClick={close} />
			<TopicForm onClose={close} />
		</div>
	);
}
