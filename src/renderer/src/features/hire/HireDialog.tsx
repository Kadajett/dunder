import "../office/interaction/cards.css";
import "./hire-dialog.css";
import type { SessionSnapshot } from "@shared/herdr/schema";
import { useEffect, useMemo } from "react";
import { HireFields } from "./HireFields";
import { useHire } from "./hire-store";
import { MiiPreview } from "./MiiPreview";
import { draftStyle, type HireFormState, useHireForm } from "./use-hire-form";

function statusLine(
	form: HireFormState,
): { readonly text: string; readonly error: boolean } | null {
	if (!form.available) return { text: "Restart the app to enable hiring.", error: true };
	if (form.serverError) return { text: form.serverError, error: true };
	if (form.busy) return { text: "Hiring…", error: false };
	if (!form.check.ok) return { text: form.check.error, error: false };
	return { text: `${form.draft.name} starts as soon as you hire them.`, error: false };
}

function HireForm({ snapshot }: { readonly snapshot: SessionSnapshot | null }) {
	const form = useHireForm(snapshot);
	const { draft, update, close } = form;
	const style = useMemo(() => draftStyle(draft), [draft]);
	const status = statusLine(form);
	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") close();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [close]);
	return (
		<div className="hire-overlay">
			<button type="button" className="hire-backdrop" aria-label="Close" onClick={close} />
			<form
				className="hire-dialog"
				onSubmit={(event) => {
					event.preventDefault();
					void form.submit();
				}}
			>
				<header>
					<strong>HIRE A NEW AGENT</strong>
					<button type="button" className="card-close" onClick={close} aria-label="Close">
						×
					</button>
				</header>
				<div className="hire-body">
					<div className="hire-look">
						<MiiPreview style={style} />
						<button
							type="button"
							className="hire-reroll"
							onClick={() => update({ seed: crypto.randomUUID() })}
						>
							↻ New look
						</button>
						<small>Their look is fixed once hired.</small>
					</div>
					<HireFields draft={draft} rooms={form.rooms} update={update} />
				</div>
				{status ? (
					<p className="hire-status" data-error={status.error}>
						{status.text}
					</p>
				) : null}
				<footer>
					<button type="button" className="hire-cancel" onClick={close}>
						Cancel
					</button>
					<button
						type="submit"
						className="card-action"
						disabled={!form.available || !form.check.ok || form.busy}
					>
						{draft.name ? `Hire ${draft.name}` : "Hire"}
					</button>
				</footer>
			</form>
		</div>
	);
}

/** The hire dialog, opened from reception or the Team panel. */
export function HireDialog({ snapshot }: { readonly snapshot: SessionSnapshot | null }) {
	const open = useHire((state) => state.open);
	return open ? <HireForm snapshot={snapshot} /> : null;
}
