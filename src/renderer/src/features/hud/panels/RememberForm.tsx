import type { MemoryProject } from "@shared/office-stats";
import { type FormEvent, useState } from "react";

/** Mirrors main's limit; main validates again. */
const MAX_CHARS = 2_000;
const KEY_PATTERN = "[A-Za-z0-9][A-Za-z0-9._\\-]*";

/** "Remember…": save a durable insight into one of the company's projects (`bd remember`). */
export function RememberForm(props: {
	readonly projects: readonly MemoryProject[];
	readonly onSaved: () => void;
}) {
	const usable = props.projects.filter((project) => project.state === "ok");
	const [cwd, setCwd] = useState(usable[0]?.cwd ?? "");
	const [text, setText] = useState("");
	const [key, setKey] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();
	const project = usable.find((candidate) => candidate.cwd === cwd) ?? usable[0];

	const submit = (event: FormEvent): void => {
		event.preventDefault();
		if (!project || !text.trim()) return;
		setSaving(true);
		setError(undefined);
		const slug = key.trim();
		void window.office.stats
			.remember({ cwd: project.cwd, text: text.trim(), ...(slug ? { key: slug } : {}) })
			.then((result) => {
				setSaving(false);
				if (!result.ok) {
					setError(result.reason);
					return;
				}
				setText("");
				setKey("");
				props.onSaved();
			});
	};

	if (usable.length === 0) return null;
	return (
		<details className="hud-remember">
			<summary>Remember…</summary>
			<form onSubmit={submit}>
				<textarea
					required
					rows={3}
					maxLength={MAX_CHARS}
					placeholder="A durable insight the company should keep (not trivia)"
					value={text}
					onChange={(event) => setText(event.target.value)}
				/>
				<div className="hud-remember-row">
					<input
						type="text"
						placeholder="key (optional, e.g. auth-jwt)"
						pattern={KEY_PATTERN}
						maxLength={100}
						value={key}
						onChange={(event) => setKey(event.target.value)}
					/>
					<select
						aria-label="Project"
						value={project?.cwd ?? ""}
						onChange={(event) => setCwd(event.target.value)}
					>
						{usable.map((candidate) => (
							<option key={candidate.cwd} value={candidate.cwd} title={candidate.cwd}>
								{candidate.name}
							</option>
						))}
					</select>
				</div>
				<button type="submit" disabled={saving || !text.trim()}>
					{saving ? "Saving…" : `Remember in ${project?.name ?? "project"}`}
				</button>
				{error ? <p className="hud-card-error">Not saved: {error}</p> : null}
			</form>
		</details>
	);
}
