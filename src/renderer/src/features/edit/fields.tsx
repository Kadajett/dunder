import type { Layout } from "@shared/layout/schema";
import type { ReactNode } from "react";
import { useEdit } from "./edit-store";

/** Apply an inspector edit; edits to the same field merge into one undo step. */
export function applyField(field: string, edit: (draft: Layout) => Layout): void {
	const { draft, selected, apply } = useEdit.getState();
	if (!draft || !selected) return;
	apply(edit(draft), `${selected.kind}:${selected.id}:${field}`);
}

export function TextField(props: {
	readonly label: string;
	readonly value: string;
	readonly placeholder?: string;
	readonly onChange: (value: string) => void;
	readonly onBlur?: () => void;
	readonly children?: ReactNode;
}) {
	return (
		<label className="edit-field">
			<span>{props.label}</span>
			<span className="edit-field-row">
				<input
					type="text"
					value={props.value}
					placeholder={props.placeholder}
					spellCheck={false}
					onChange={(event) => props.onChange(event.target.value)}
					onBlur={props.onBlur}
				/>
				{props.children}
			</span>
		</label>
	);
}

export function NumberField(props: {
	readonly label: string;
	readonly value: number;
	readonly step: number;
	readonly onChange: (value: number) => void;
}) {
	return (
		<label className="edit-field edit-field-number">
			<span>{props.label}</span>
			<input
				type="number"
				value={props.value}
				step={props.step}
				min={props.step}
				onChange={(event) => {
					const value = event.target.valueAsNumber;
					if (Number.isFinite(value)) props.onChange(value);
				}}
			/>
		</label>
	);
}
