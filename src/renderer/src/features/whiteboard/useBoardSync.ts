import { createLogger } from "@shared/log/logger";
import type { WhiteboardBoard } from "@shared/whiteboard";
import { useEffect } from "react";
import { type Editor, getSnapshot } from "tldraw";
import { mergeRecords, missingRecords, remoteStep } from "./board-sync";

const log = createLogger("whiteboard");

/** Quiet time after Jeremy's last edit before the document goes to main. */
const SAVE_DEBOUNCE_MS = 500;

/** Board to sync, and what to do when main says the editor needs a different document. */
interface SyncTarget {
	readonly board: WhiteboardBoard;
	readonly onReload: (board: WhiteboardBoard) => void;
}

/** Wire one mounted editor to main; returns the teardown, which saves any edit still waiting. */
function startBoardSync(editor: Editor, { board, onReload }: SyncTarget): () => void {
	const api = window.office.whiteboard;
	let revision = board.revision;
	let timer: number | undefined;
	let saving = Promise.resolve();
	let stopped = false;

	const save = async (): Promise<void> => {
		const snapshot = getSnapshot(editor.store).document;
		const result = await api.put({ companyId: board.companyId, baseRevision: revision, snapshot });
		if (result.state === "rejected") {
			log.info("save rejected, reloading the board", { reason: result.reason });
			if (!stopped) onReload(result.board);
			return;
		}
		revision = Math.max(revision, result.board.revision);
		if (result.merged && !stopped) {
			mergeRecords(editor.store, missingRecords(editor.store, result.board.snapshot));
		}
	};
	// One save at a time, so each one's base revision includes the one before.
	const flush = (): void => {
		if (timer === undefined) return;
		window.clearTimeout(timer);
		timer = undefined;
		saving = saving
			.then(save)
			.catch((error: unknown) => log.warn("whiteboard not saved", { error }));
	};
	const offEdits = editor.store.listen(
		() => {
			window.clearTimeout(timer);
			timer = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
		},
		{ source: "user", scope: "document" },
	);
	const offRemote = api.onChanged((change) => {
		const step = remoteStep(change, board.companyId);
		if (step.kind === "merge") {
			mergeRecords(editor.store, step.records);
			revision = Math.max(revision, step.revision);
		} else if (step.kind === "reload") {
			onReload(step.board);
		}
	});
	return () => {
		stopped = true;
		offEdits();
		offRemote();
		flush();
	};
}

/**
 * Keep the open editor and main's board in step: Jeremy's edits go to main
 * (debounced, one save at a time, flushed on close); agents' notes merge in
 * live; a cleared board or another company's goes to `onReload`.
 */
export function useBoardSync(
	editor: Editor | null,
	board: WhiteboardBoard,
	onReload: (board: WhiteboardBoard) => void,
): void {
	useEffect(() => {
		if (!editor) return;
		return startBoardSync(editor, { board, onReload });
	}, [editor, board, onReload]);
}
