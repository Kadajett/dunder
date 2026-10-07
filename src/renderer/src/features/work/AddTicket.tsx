import { WORK_TITLE_MAX, workTitleSchema } from "@shared/work-board";
import { type KeyboardEvent, useState } from "react";
import { WorkError } from "./WorkError";
import { ADD_ERROR, createCard, useWork } from "./work-store";

/** The '+ Add ticket' row at the top of Ready: Enter creates a P2 open task, Esc cancels. */
export function AddTicket() {
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState("");
	const creating = useWork((state) => state.creating);
	const cancel = (): void => {
		setTitle("");
		setEditing(false);
	};
	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
		// Typing here is the input's alone (Esc included); outside the input nothing is stolen.
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			cancel();
		} else if (event.key === "Enter") {
			event.preventDefault();
			const parsed = workTitleSchema.safeParse(title);
			if (!parsed.success) return;
			void createCard(parsed.data);
			cancel();
		}
	};
	return (
		<div className="work-add">
			{editing ? (
				<input
					className="work-add__input"
					// biome-ignore lint/a11y/noAutofocus: the input appears because Jeremy just asked to type a title.
					autoFocus
					maxLength={WORK_TITLE_MAX}
					placeholder="Title, then Enter"
					aria-label="New ticket title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					onKeyDown={onKeyDown}
					onBlur={() => title.trim() === "" && cancel()}
				/>
			) : (
				<button type="button" className="work-add__button" onClick={() => setEditing(true)}>
					+ Add ticket
				</button>
			)}
			{creating.map((pending) => (
				<p key={pending.seq} className="work-add__pending" title={pending.value}>
					{pending.value}
				</p>
			))}
			<WorkError errorKey={ADD_ERROR} />
		</div>
	);
}
