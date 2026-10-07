import "./excalidraw-assets";
import "@excalidraw/excalidraw/index.css";
import "./whiteboard.css";
import { Excalidraw, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type {
	ExcalidrawImperativeAPI,
	ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { WhiteboardBoard } from "@shared/whiteboard";
import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useWork } from "../work/work-store";
import { noteAt, tagNote } from "./sticky-note";
import { useBoardSync } from "./useBoardSync";
import { useWhiteboard } from "./whiteboard-store";

/** The board the editor shows; a new generation remounts it on a fresh document. */
interface Loaded {
	readonly board: WhiteboardBoard;
	readonly generation: number;
}

type LoadState =
	| { readonly kind: "loading" }
	| { readonly kind: "failed"; readonly reason: string }
	| ({ readonly kind: "ready" } & Loaded);

/** Only the canvas: no file open/save or theme switch, the board lives in main. */
const UI_OPTIONS = {
	canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false },
} as const;

interface StickyAction {
	readonly text: string;
	readonly author: string;
	readonly elementIds: ReadonlySet<string>;
	readonly beadId?: string;
	readonly x: number;
	readonly y: number;
}

function dataOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function BoardEditor(props: {
	readonly board: WhiteboardBoard;
	readonly onReload: (board: WhiteboardBoard) => void;
}) {
	const { board } = props;
	const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
	const [action, setAction] = useState<StickyAction | null>(null);
	const [error, setError] = useState<string | null>(null);
	useBoardSync(api, board, props.onReload);
	const initialData = useMemo(
		(): ExcalidrawInitialDataState => ({
			elements: board.scene?.elements ?? [],
			...(board.scene?.files ? { files: board.scene.files } : {}),
			scrollToContent: true,
		}),
		[board],
	);
	// Capture phase: on a sticky, 'Make idea bead' replaces Excalidraw's own menu.
	const onContextMenuCapture = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			setError(null);
			if (!api) return;
			const point = viewportCoordsToSceneCoords(event, api.getAppState());
			const note = noteAt(api.getSceneElements(), point.x, point.y);
			if (note?.type !== "text") {
				setAction(null);
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const data = dataOf(note.customData);
			const elementIds = new Set([note.id, ...(note.containerId ? [note.containerId] : [])]);
			setAction({
				text: note.originalText,
				author: typeof data["author"] === "string" ? data["author"] : "jeremy",
				elementIds,
				...(typeof data["beadId"] === "string" ? { beadId: data["beadId"] } : {}),
				x: event.clientX,
				y: event.clientY,
			});
		},
		[api],
	);
	const makeIdea = useCallback(async () => {
		if (!api || !action) return;
		setError(null);
		try {
			if (action.beadId) {
				useWhiteboard.getState().setOpen(false);
				useWork.getState().reveal(action.beadId);
				setAction(null);
				return;
			}
			const id = await window.office.whiteboard.makeIdea({
				text: action.text,
				author: action.author,
			});
			api.updateScene({
				elements: tagNote(api.getSceneElements(), action.elementIds, id, Date.now()),
			});
			setAction(null);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		}
	}, [action, api]);
	return (
		<div
			className="whiteboard-editor"
			role="application"
			aria-label="Whiteboard drawing"
			onContextMenuCapture={onContextMenuCapture}
		>
			<Excalidraw
				excalidrawAPI={setApi}
				initialData={initialData}
				UIOptions={UI_OPTIONS}
				name="Office whiteboard"
			/>
			{action && (
				<button
					type="button"
					className="whiteboard-idea-action"
					style={{ left: action.x, top: action.y }}
					onClick={() => void makeIdea()}
				>
					{action.beadId ? `Open ${action.beadId}` : "Make idea bead"}
				</button>
			)}
			{error && (
				<div
					className="whiteboard-idea-error"
					role="alert"
					style={{ left: action?.x, top: action ? action.y + 38 : 0 }}
				>
					{error}
				</div>
			)}
		</div>
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

function BoardArea(props: {
	readonly state: LoadState;
	readonly onReload: (board: WhiteboardBoard) => void;
}) {
	const { state } = props;
	if (state.kind === "ready") {
		return (
			<BoardEditor
				key={`${state.board.companyId}:${state.generation}`}
				board={state.board}
				onReload={props.onReload}
			/>
		);
	}
	return (
		<p className="whiteboard-status">
			{state.kind === "failed" ? `The whiteboard did not load: ${state.reason}` : "Loading…"}
		</p>
	);
}

/**
 * The office whiteboard in Excalidraw, over the whole window. Leaving is the
 * Back button, never Esc: Excalidraw uses Esc to drop the selection or the tool.
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
				<BoardArea state={state} onReload={reload} />
			</div>
		</div>
	);
}
