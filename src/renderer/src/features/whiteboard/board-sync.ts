import type {
	WhiteboardBoard,
	WhiteboardChange,
	WhiteboardRecord,
	WhiteboardSnapshot,
} from "@shared/whiteboard";
import type { TLStore } from "@tldraw/tlschema";

/** What the open editor does with a change main broadcast. */
export type RemoteStep =
	/** Agents added these shapes: merge them in, keeping Jeremy's own edits. */
	| {
			readonly kind: "merge";
			readonly records: readonly WhiteboardRecord[];
			readonly revision: number;
	  }
	/** A different document (cleared, or another company's board): load it instead. */
	| { readonly kind: "reload"; readonly board: WhiteboardBoard }
	/** This editor's own save: its store already holds it. */
	| { readonly kind: "ignore" };

export function remoteStep(change: WhiteboardChange, companyId: string): RemoteStep {
	const { board, cause } = change;
	if (board.companyId !== companyId) return { kind: "reload", board };
	switch (cause.kind) {
		case "note":
		case "text":
			return { kind: "merge", records: cause.records, revision: board.revision };
		case "clear":
		case "company":
			return { kind: "reload", board };
		case "editor":
			return { kind: "ignore" };
	}
}

/**
 * Put records from main into the editor's store as a remote change: tldraw
 * keeps them out of Jeremy's undo history and does not echo them back as his
 * edits, and whatever he is drawing or moving stays as it is.
 */
export function mergeRecords(store: TLStore, records: readonly WhiteboardRecord[]): void {
	if (records.length === 0) return;
	store.mergeRemoteChanges(() => store.put([...records]));
}

/** Records of `snapshot` the store lacks: agent posts main kept while a save of this editor was on its way. */
export function missingRecords(
	store: TLStore,
	snapshot: WhiteboardSnapshot | null,
): WhiteboardRecord[] {
	if (!snapshot) return [];
	return Object.values(snapshot.store).filter((record) => !store.has(record.id));
}
