import "./company-form.css";
import { type FormEvent, useEffect, useRef, useState } from "react";

export interface CompanyFormValues {
	readonly name: string;
	readonly subtitle: string;
	/** Only when the form shows the company settings (spend alarm, editor). */
	readonly settings: { readonly spendAlarmUsd: number; readonly editorCommand: string } | undefined;
}

interface CompanyFormProps {
	readonly heading: string;
	readonly submitLabel: string;
	readonly initialName: string;
	readonly initialSubtitle: string;
	/** Show the spend alarm and editor fields with these values (company settings); omitted for a new company. */
	readonly initialSettings?: { readonly spendAlarmUsd: number; readonly editorCommand: string };
	/** Persist the company; a rejection is shown in the form. */
	readonly onSubmit: (values: CompanyFormValues) => Promise<void>;
	readonly onCancel: () => void;
}

function EditorField({
	value,
	onChange,
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<label className="company-form-field">
			<span>Editor for "Open in editor" (e.g. code, cursor -n, zed)</span>
			<input
				value={value}
				maxLength={200}
				required
				placeholder="code"
				onChange={(event) => onChange(event.target.value)}
			/>
		</label>
	);
}

/** Company form used by the company menu for "New company…" and the current company's settings. */
export function CompanyForm(props: CompanyFormProps) {
	const [name, setName] = useState(props.initialName);
	const [subtitle, setSubtitle] = useState(props.initialSubtitle);
	const [alarm, setAlarm] = useState(String(props.initialSettings?.spendAlarmUsd ?? ""));
	const [editor, setEditor] = useState(props.initialSettings?.editorCommand ?? "");
	const [error, setError] = useState<string | undefined>();
	const [busy, setBusy] = useState(false);
	const nameRef = useRef<HTMLInputElement>(null);
	useEffect(() => nameRef.current?.focus(), []);
	const withAlarm = props.initialSettings !== undefined;

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		setBusy(true);
		setError(undefined);
		const settings = withAlarm
			? { spendAlarmUsd: Number(alarm), editorCommand: editor.trim() }
			: undefined;
		props.onSubmit({ name: name.trim(), subtitle: subtitle.trim(), settings }).then(
			() => setBusy(false),
			(reason: unknown) => {
				setBusy(false);
				setError(reason instanceof Error ? reason.message : String(reason));
			},
		);
	};

	return (
		<form className="company-form" onSubmit={submit}>
			<p className="hud-menu-heading">{props.heading}</p>
			<label className="company-form-field">
				<span>Name</span>
				<input
					ref={nameRef}
					value={name}
					maxLength={60}
					required
					onChange={(event) => setName(event.target.value)}
				/>
			</label>
			<label className="company-form-field">
				<span>Subtitle</span>
				<input
					value={subtitle}
					maxLength={120}
					placeholder="AI-native company · runs on Dunder"
					onChange={(event) => setSubtitle(event.target.value)}
				/>
			</label>
			{withAlarm ? (
				<label className="company-form-field">
					<span>Spend alarm: an agent spending more than this many US dollars in 30 minutes</span>
					<input
						type="number"
						min={0.5}
						max={10_000}
						step={0.5}
						required
						value={alarm}
						onChange={(event) => setAlarm(event.target.value)}
					/>
				</label>
			) : null}
			{withAlarm ? <EditorField value={editor} onChange={setEditor} /> : null}
			{error ? <p className="company-form-error">{error}</p> : null}
			<div className="company-form-actions">
				<button type="button" className="company-form-cancel" onClick={props.onCancel}>
					Cancel
				</button>
				<button type="submit" className="company-form-submit" disabled={busy || !name.trim()}>
					{props.submitLabel}
				</button>
			</div>
		</form>
	);
}
