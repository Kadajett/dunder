import { CaptureUpdateAction, getSceneVersion } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { createLogger } from "@shared/log/logger";
import type { WhiteboardBoard, WhiteboardScene } from "@shared/whiteboard";
import { changesScene, mergeElements } from "@shared/whiteboard-merge";
import { useEffect } from "react";
import { remoteStep } from "./board-sync";

const log = createLogger("whiteboard");

/** Quiet time after Jeremy's last edit before the scene goes to main. */
const SAVE_DEBOUNCE_MS = 500;

/** Board to sync, and what to do when main says the editor needs a different document. */
interface SyncTarget {
	readonly board: WhiteboardBoard;
	readonly onReload: (board: WhiteboardBoard) => void;
}

/** Files (pasted images) the editor does not have yet. */
function newFiles(api: ExcalidrawImperativeAPI, files: BinaryFiles | undefined) {
	const known = api.getFiles();
	return Object.values(files ?? {}).filter((file) => !Object.hasOwn(known, file.id));
}

/**
 * Merge main's `scene` into the open editor, outside Jeremy's undo history
 * (agents' notes are theirs). Returns the merged elements, or undefined when
 * nothing changed.
 */
function mergeIntoEditor(
	api: ExcalidrawImperativeAPI,
	scene: WhiteboardScene,
): readonly ExcalidrawElement[] | undefined {
	const local = api.getSceneElementsIncludingDeleted();
	const files = newFiles(api, scene.files);
	if (files.length > 0) api.addFiles(files);
	if (!changesScene(local, scene.elements)) return undefined;
	const elements: ExcalidrawElement[] = mergeElements(local, scene.elements);
	api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
	return elements;
}

/** Wire one mounted editor to main; returns the teardown, which saves any edit still waiting. */
function startBoardSync(api: ExcalidrawImperativeAPI, { board, onReload }: SyncTarget): () => void {
	const whiteboard = window.office.whiteboard;
	let revision = board.revision;
	// Sum of element versions already in step with main: changes that leave it alone
	// (selection, zoom, merged remote elements) are not Jeremy's edits. Taken from
	// main's scene: the editor loads its initial data after this runs.
	let synced = getSceneVersion(board.scene?.elements ?? []);
	let timer: number | undefined;
	let saving = Promise.resolve();
	let stopped = false;

	const applyRemote = (scene: WhiteboardScene | null): void => {
		if (!scene || stopped) return;
		const merged = mergeIntoEditor(api, scene);
		if (merged) synced = getSceneVersion(merged);
	};
	const save = async (scene: WhiteboardScene): Promise<void> => {
		const result = await whiteboard.put({
			companyId: board.companyId,
			baseRevision: revision,
			scene,
		});
		if (result.state === "rejected") {
			log.info("save rejected, reloading the board", { reason: result.reason });
			if (!stopped) onReload(result.board);
			return;
		}
		revision = Math.max(revision, result.board.revision);
		if (result.merged) applyRemote(result.board.scene);
	};
	// One save at a time, so each one's base revision includes the one before.
	const flush = (): void => {
		if (timer === undefined) return;
		window.clearTimeout(timer);
		timer = undefined;
		// Read the scene now: by the time the previous save is done the editor may be gone (closed).
		const scene = { elements: api.getSceneElementsIncludingDeleted(), files: api.getFiles() };
		saving = saving
			.then(() => save(scene))
			.catch((error: unknown) => log.warn("whiteboard not saved", { error }));
	};
	const offEdits = api.onChange((elements) => {
		const version = getSceneVersion(elements);
		if (version === synced) return;
		synced = version;
		window.clearTimeout(timer);
		timer = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
	});
	const offRemote = whiteboard.onChanged((change) => {
		const step = remoteStep(change, board.companyId);
		if (step.kind === "merge") {
			applyRemote({ elements: step.records });
			revision = Math.max(revision, step.revision);
		} else if (step.kind === "reload") {
			onReload(step.board);
		}
	});
	return () => {
		flush();
		stopped = true;
		offEdits();
		offRemote();
	};
}

/**
 * Keep the open editor and main's board in step: Jeremy's edits go to main
 * (debounced, one save at a time, flushed on close); agents' notes merge in
 * live; a cleared board or another company's goes to `onReload`.
 */
export function useBoardSync(
	api: ExcalidrawImperativeAPI | null,
	board: WhiteboardBoard,
	onReload: (board: WhiteboardBoard) => void,
): void {
	useEffect(() => {
		if (!api) return;
		return startBoardSync(api, { board, onReload });
	}, [api, board, onReload]);
}
