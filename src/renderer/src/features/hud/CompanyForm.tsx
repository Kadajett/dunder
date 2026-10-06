import "./company-form.css";
import { type FormEvent, useEffect, useRef, useState } from "react";

interface CompanyFormProps {
	readonly heading: string;
	readonly submitLabel: string;
	readonly initialName: string;
	readonly initialSubtitle: string;
	/** Persist the company; a rejection is shown in the form. */
	readonly onSubmit: (name: string, subtitle: string) => Promise<void>;
	readonly onCancel: () => void;
}

/** Name + subtitle form used by the company menu for "New company…" and "Rename…". */
export function CompanyForm(props: CompanyFormProps) {
	const [name, setName] = useState(props.initialName);
	const [subtitle, setSubtitle] = useState(props.initialSubtitle);
	const [error, setError] = useState<string | undefined>();
	const [busy, setBusy] = useState(false);
	const nameRef = useRef<HTMLInputElement>(null);
	useEffect(() => nameRef.current?.focus(), []);

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		setBusy(true);
		setError(undefined);
		props.onSubmit(name.trim(), subtitle.trim()).then(
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
					placeholder="AI-native company · runs on herdr"
					onChange={(event) => setSubtitle(event.target.value)}
				/>
			</label>
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
