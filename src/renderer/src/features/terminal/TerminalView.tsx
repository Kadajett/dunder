import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { mountTerminal } from "./mount-terminal";

export interface TerminalViewProps {
	readonly paneId: string;
	/**
	 * herdr's rendered frames do not carry the pane's bracketed-paste mode, so
	 * the caller decides. Agent TUIs (omp, claude, codex) all enable it.
	 */
	readonly bracketedPaste: boolean;
	readonly takeover?: boolean;
	readonly autoFocus?: boolean;
	readonly fontSize?: number;
	readonly className?: string;
}

/** A fully interactive screen attached to one herdr pane. */
export function TerminalView(props: TerminalViewProps) {
	const { paneId, bracketedPaste, takeover = true, autoFocus = true, fontSize } = props;
	const hostRef = useRef<HTMLDivElement>(null);
	const [closedReason, setClosedReason] = useState<string>();

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		setClosedReason(undefined);
		const mounted = mountTerminal(host, {
			paneId,
			bracketedPaste,
			takeover,
			...(fontSize ? { fontSize } : {}),
			onClosed: setClosedReason,
		});
		if (autoFocus) mounted.focus();
		return () => mounted.dispose();
	}, [paneId, bracketedPaste, takeover, autoFocus, fontSize]);

	return (
		<div
			className={`terminal-view ${props.className ?? ""}`}
			data-closed={closedReason !== undefined}
		>
			<div className="terminal-host" ref={hostRef} />
		</div>
	);
}
