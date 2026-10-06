import "tldraw/tldraw.css";
import "./whiteboard.css";
import type { WhiteboardBoard } from "@shared/whiteboard";
import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import { useCallback, useEffect, useState } from "react";
import { type Editor, Tldraw } from "tldraw";
import { useBoardSync } from "./useBoardSync";
import { useWhiteboard } from "./whiteboard-store";

/** tldraw's fonts, icons and translations, bundled with the app: the CSP allows no CDN. */
const ASSET_URLS = getAssetUrlsByImport();

/** The board the editor shows; a new generation remounts it on a fresh document. */
interface Loaded {
	readonly board: WhiteboardBoard;
	readonly generation: number;
}

type LoadState =
	| { readonly kind: "loading" }
	| { readonly kind: "failed"; readonly reason: string }
	| ({ readonly kind: "ready" } & Loaded);

function BoardEditor(props: {
	readonly board: WhiteboardBoard;
	readonly onReload: (board: WhiteboardBoard) => void;
}) {
	const { board } = props;
	const [editor, setEditor] = useState<Editor | null>(null);
	useBoardSync(editor, board, props.onReload);
	return (
		<Tldraw
			{...(board.snapshot ? { snapshot: board.snapshot } : {})}
			assetUrls={ASSET_URLS}
			onMount={(mounted) => {
				mounted.user.updateUserPreferences({ name: "Jeremy" });
				setEditor(mounted);
			}}
		/>
	);
}

/** The current company's board from main, once per open. */
function useBoard(): readonly [LoadState, (board: WhiteboardBoard) => void] {
	const [state, setState] = useState<LoadState>({ kind: "loading" });
	useEffect(() => {
		let live = true;
		window.office.whiteboard.get().then(
			(board) => live && setState({ kind: "ready", board, generation: 0 }),
			(error: unknown) =>
				live &&
				setState({
					kind: "failed",
					reason: error instanceof Error ? error.message : String(error),
				}),
		);
		return () => {
			live = false;
		};
	}, []);
	const reload = useCallback(
		(board: WhiteboardBoard) =>
			setState((previous) => ({
				kind: "ready",
				board,
				generation: previous.kind === "ready" ? previous.generation + 1 : 0,
			})),
		[],
	);
	return [state, reload];
}

/**
 * The office whiteboard in tldraw, over the whole window. Leaving is the Back
 * button, never Esc: tldraw uses Esc to drop the selection or the current tool.
 */
export function WhiteboardLayer() {
	const setOpen = useWhiteboard((state) => state.setOpen);
	const [state, reload] = useBoard();
	return (
		// data-own-keys: app shortcuts (edit mode's R, Delete, Esc) leave keys pressed in here alone.
		<div
			className="whiteboard-layer"
			role="dialog"
			aria-modal="true"
			aria-label="Whiteboard"
			data-own-keys=""
		>
			<header className="whiteboard-bar">
				<button type="button" className="whiteboard-back" onClick={() => setOpen(false)}>
					← Back to office
				</button>
				<div className="whiteboard-title">
					<strong>Whiteboard</strong>
					<span>agents post notes here with office-board</span>
				</div>
			</header>
			<div className="whiteboard-canvas">
				{state.kind === "ready" ? (
					<BoardEditor
						key={`${state.board.companyId}:${state.generation}`}
						board={state.board}
						onReload={reload}
					/>
				) : (
					<p className="whiteboard-status">
						{state.kind === "failed" ? `The whiteboard did not load: ${state.reason}` : "Loading…"}
					</p>
				)}
			</div>
		</div>
	);
}
