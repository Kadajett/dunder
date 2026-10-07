import { useWork } from "./work-store";

/** A failed write's inline error (for a card id or the add row), dismissible. */
export function WorkError({ errorKey }: { readonly errorKey: string }) {
	const error = useWork((state) => state.errors[errorKey]);
	const dismiss = useWork((state) => state.dismissError);
	if (!error) return null;
	return (
		<p className="work-error" role="alert">
			<span>{error}</span>
			<button type="button" aria-label="Dismiss" onClick={() => dismiss(errorKey)}>
				×
			</button>
		</p>
	);
}
