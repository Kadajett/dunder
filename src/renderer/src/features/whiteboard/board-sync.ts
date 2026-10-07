import type { WhiteboardBoard, WhiteboardChange, WhiteboardElement } from "@shared/whiteboard";

/** What the open editor does with a change main broadcast. */
export type RemoteStep =
	/** Agents added these elements: merge them in, keeping Jeremy's own edits. */
	| {
			readonly kind: "merge";
			readonly records: readonly WhiteboardElement[];
			readonly revision: number;
	  }
	/** A different document (cleared, or another company's board): load it instead. */
	| { readonly kind: "reload"; readonly board: WhiteboardBoard }
	/** This editor's own save: its scene already holds it. */
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
