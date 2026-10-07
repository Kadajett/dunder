import "./company-form.css";
import { type FormEvent, useEffect, useRef, useState } from "react";

export interface CompanyFormValues {
	readonly name: string;
	readonly subtitle: string;
	/** Only when the form shows the spend alarm field. */
	readonly spendAlarmUsd: number | undefined;
}

interface CompanyFormProps {
	readonly heading: string;
	readonly submitLabel: string;
	readonly initialName: string;
	readonly initialSubtitle: string;
	/** Show the runaway-spend alarm field with this value (company settings); omitted for a new company. */
	readonly initialSpendAlarmUsd?: number;
	/** Persist the company; a rejection is shown in the form. */
	readonly onSubmit: (values: CompanyFormValues) => Promise<void>;
	readonly onCancel: () => void;
}

/** Company form used by the company menu for "New company…" and the current company's settings. */
export function CompanyForm(props: CompanyFormProps) {
	const [name, setName] = useState(props.initialName);
	const [subtitle, setSubtitle] = useState(props.initialSubtitle);
	const [alarm, setAlarm] = useState(String(props.initialSpendAlarmUsd ?? ""));
	const [error, setError] = useState<string | undefined>();
	const [busy, setBusy] = useState(false);
	const nameRef = useRef<HTMLInputElement>(null);
	useEffect(() => nameRef.current?.focus(), []);
	const withAlarm = props.initialSpendAlarmUsd !== undefined;

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		setBusy(true);
		setError(undefined);
		const spendAlarmUsd = withAlarm ? Number(alarm) : undefined;
		props.onSubmit({ name: name.trim(), subtitle: subtitle.trim(), spendAlarmUsd }).then(
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
