import { shortModelName } from "@shared/models";
import type { ScreenState } from "@shared/screens";
import { useState } from "react";
import { useModels } from "../office/models/models-store";
import { useScreenCanvas } from "../screens/useScreenCanvas";
import { TerminalView } from "../terminal/TerminalView";
import type { ClassicTile as Tile } from "./classic-tiles";

export interface ClassicTileProps {
	readonly tile: Tile;
	/** Showing the live terminal instead of the preview. */
	readonly open: boolean;
	readonly wide: boolean;
	onOpen(paneId: string): void;
	onClose(paneId: string): void;
	onToggleWide(paneId: string): void;
}

const STATE_LABEL: Record<Exclude<ScreenState, "live">, string> = {
	connecting: "connecting…",
	disconnected: "disconnected",
	closed: "closed",
};

/** The shared headless-painted screen, as on the 3D monitor; click to open the terminal. */
function ScreenPreview(props: { readonly paneId: string; readonly name: string; onOpen(): void }) {
	const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
	const state = useScreenCanvas(props.paneId, canvas);
	return (
		<button
			type="button"
			className="classic-preview"
			onClick={props.onOpen}
			aria-label={`Open ${props.name}'s terminal`}
		>
			<canvas ref={setCanvas} className="classic-preview-canvas" />
			{state === "live" ? null : (
				<span className="classic-preview-state">{STATE_LABEL[state]}</span>
			)}
			<span className="classic-preview-hint">Open terminal</span>
		</button>
	);
}

function ModelTag({ agentName, kind }: { readonly agentName: string; readonly kind: string }) {
	const live = useModels((state) => state.live[agentName]);
	let label = kind;
	if (live?.pending) label = `→ ${shortModelName(live.pending.model)}`;
	else if (live) label = shortModelName(live.model);
	return (
		<span className="classic-tile-model" title={live?.pending?.model ?? live?.model ?? kind}>
			{label}
		</span>
	);
}

/** One agent: status, name, room, live model, and its screen (preview or live terminal). */
export function ClassicTile(props: ClassicTileProps) {
	const { tile, open, wide } = props;
	const { agent } = tile;
	return (
		<article className="classic-tile" data-open={open} data-wide={open && wide}>
			<header className="classic-tile-head">
				<span className={`status-dot status-${agent.status}`} title={agent.status} />
				<strong className="classic-tile-name">{agent.name}</strong>
				<span className="classic-tile-room">{tile.room}</span>
				<ModelTag agentName={agent.name} kind={agent.kind} />
				{open ? (
					<span className="classic-tile-actions">
						<button
							type="button"
							className="classic-tile-button"
							onClick={() => props.onToggleWide(agent.paneId)}
							aria-pressed={wide}
							title={wide ? "Back to grid size" : "Expand to full width"}
						>
							{wide ? "⇥⇤" : "⇤⇥"}
						</button>
						<button
							type="button"
							className="classic-tile-button"
							onClick={() => props.onClose(agent.paneId)}
							aria-label={`Close ${agent.name}'s terminal`}
							title="Close terminal"
						>
							×
						</button>
					</span>
				) : null}
			</header>
			<div className="classic-tile-screen">
				{open ? (
					<TerminalView paneId={agent.paneId} bracketedPaste fontSize={12} />
				) : (
					<ScreenPreview
						paneId={agent.paneId}
						name={agent.name}
						onOpen={() => props.onOpen(agent.paneId)}
					/>
				)}
			</div>
		</article>
	);
}
