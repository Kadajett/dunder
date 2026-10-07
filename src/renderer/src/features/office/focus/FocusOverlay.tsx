import "./focus.css";
import { useEffect } from "react";
import { useChief } from "../../chief/chief-store";
import { TerminalView } from "../../terminal/TerminalView";
import { useFocus } from "./focus-store";

/** Leaving focus is bound to this chord, never to Esc (omp, vim and every TUI need Esc). */
export const LEAVE_CHORD_LABEL = "Ctrl+Shift+O";

export function isLeaveChord(event: KeyboardEvent): boolean {
	return (
		event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyO"
	);
}

/** Terminal font size that keeps ~38 rows on the monitor's screen. */
function fontSizeFor(height: number): number {
	return Math.min(15, Math.max(11, Math.floor(height / 38 / 1.2)));
}

/**
 * While a computer is focused: a click-catching backdrop (click outside the
 * screen to leave), the real terminal mounted exactly over the monitor, and
 * a visible way back.
 */
export function FocusOverlay() {
	const target = useFocus((state) => (state.target?.kind === "screen" ? state.target : null));
	const phase = useFocus((state) => (state.target?.kind === "screen" ? state.phase : null));
	const rect = useFocus((state) => state.rect);
	const leave = useFocus((state) => state.leave);
	const dockOpen = useChief((state) => state.expanded);

	useEffect(() => {
		if (phase === null) return;
		const onKey = (event: KeyboardEvent): void => {
			if (!isLeaveChord(event)) return;
			event.preventDefault();
			event.stopPropagation();
			leave();
		};
		// Capture phase: runs before xterm's own key handling on its textarea.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [phase, leave]);

	if (phase === null || target === null) return null;
	const showTerminal = phase === "focused" && rect !== null;
	return (
		<div className="focus-layer" data-phase={phase} data-dock={dockOpen ? "open" : "closed"}>
			<button
				type="button"
				className="focus-backdrop"
				aria-label="Back to office"
				onClick={leave}
			/>
			{showTerminal ? (
				<div
					className="focus-screen"
					style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
				>
					<TerminalView
						paneId={target.paneId}
						bracketedPaste={target.bracketedPaste}
						fontSize={fontSizeFor(rect.height)}
					/>
				</div>
			) : null}
			<div className="focus-bar">
				<button type="button" className="focus-back" onClick={leave}>
					← Back to office
				</button>
				<span className="focus-title">
					<strong>{target.agentName.toUpperCase()}</strong>'s screen · live
				</span>
				<span className="focus-hint">
					click outside or <kbd>{LEAVE_CHORD_LABEL}</kbd> to leave · Esc goes to the terminal
				</span>
			</div>
		</div>
	);
}
