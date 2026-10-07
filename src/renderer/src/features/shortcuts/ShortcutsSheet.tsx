import "./shortcuts.css";
import { useEffect, useRef } from "react";
import {
	isHelpShortcut,
	isTextEntryTarget,
	SHORTCUTS,
	type ShortcutGroup,
	useShortcutSheet,
} from "../../shortcuts";
import { useFocus } from "../office/focus/focus-store";

const GROUPS: readonly ShortcutGroup[] = [
	"Everywhere",
	"Terminal",
	"Call",
	"Edit mode",
	"TV",
	"Pool",
	"Dialogs",
];

export function ShortcutsSheet() {
	const open = useShortcutSheet((state) => state.open);
	const setOpen = useShortcutSheet((state) => state.setOpen);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			if (open) {
				event.preventDefault();
				event.stopPropagation();
				if (event.key === "Escape" || isHelpShortcut(event)) setOpen(false);
				return;
			}
			if (useFocus.getState().target?.kind === "screen" || isTextEntryTarget(event.target)) return;
			if (!isHelpShortcut(event)) return;
			event.preventDefault();
			event.stopPropagation();
			setOpen(true);
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [open, setOpen]);

	if (!open) return null;
	return <ShortcutsSheetView onClose={() => setOpen(false)} />;
}

export function ShortcutsSheetView({ onClose }: { readonly onClose: () => void }) {
	const closeButton = useRef<HTMLButtonElement>(null);
	useEffect(() => closeButton.current?.focus(), []);

	return (
		<div className="shortcuts-overlay">
			<button
				type="button"
				className="shortcuts-backdrop"
				aria-label="Close keyboard shortcuts"
				tabIndex={-1}
				onClick={onClose}
			/>
			<section
				className="shortcuts-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="shortcuts-title"
			>
				<header className="shortcuts-sheet__header">
					<h2 id="shortcuts-title">Keyboard shortcuts</h2>
					<button
						ref={closeButton}
						type="button"
						className="shortcuts-sheet__close"
						aria-label="Close keyboard shortcuts"
						onClick={onClose}
					>
						×
					</button>
				</header>
				<div className="shortcuts-sheet__groups">
					{GROUPS.map((group) => (
						<section key={group} aria-labelledby={`shortcuts-group-${group}`}>
							<h3 id={`shortcuts-group-${group}`}>{group}</h3>
							<dl>
								{SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
									<div className="shortcuts-sheet__row" key={`${shortcut.keys}:${shortcut.action}`}>
										<dt>{shortcut.keys}</dt>
										<dd>{shortcut.action}</dd>
									</div>
								))}
							</dl>
						</section>
					))}
				</div>
				<p className="shortcuts-sheet__hint">Press ? or Esc to close</p>
			</section>
		</div>
	);
}
