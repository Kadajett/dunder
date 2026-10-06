import type { TLRecord, TLStoreSnapshot } from "@tldraw/tlschema";
import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * The office whiteboard: one tldraw document per company, owned by the main
 * process. Jeremy edits it in the renderer's tldraw editor; agents add sticky
 * notes and text from the shell with `office-board`. Main merges both.
 */

/**
 * A tldraw document snapshot, as the editor produces and loads it:
 * `getSnapshot(editor.store).document` / `loadSnapshot(editor.store, { document })`.
 * Main and renderer must use the same tldraw version (package.json pins it
 * exactly); main migrates and validates every snapshot it is given.
 */
export type WhiteboardSnapshot = TLStoreSnapshot;

/** One tldraw record. */
export type WhiteboardRecord = TLRecord;

/** The current company's board. */
export interface WhiteboardBoard {
	readonly companyId: string;
	/** Goes up by one on every accepted change: an editor put, an agent's note or text, a clear. */
	readonly revision: number;
	/** `null` until anything is drawn: start the editor on an empty document. */
	readonly snapshot: WhiteboardSnapshot | null;
}

/** Why the board changed, for listeners that apply changes incrementally. */
export type WhiteboardCause =
	/** Jeremy's editor saved (another window may need to reload). */
	| { readonly kind: "editor" }
	/** An agent added shapes: exactly these records, already in `board.snapshot`. */
	| {
			readonly kind: "note" | "text";
			readonly by: string;
			readonly records: readonly WhiteboardRecord[];
	  }
	/** The chief wiped every shape. */
	| { readonly kind: "clear"; readonly by: string }
	/** The current company switched: a different board altogether. */
	| { readonly kind: "company" };

/** Broadcast (main → renderer) on `IPC.whiteboardChanged` after every accepted change. */
export interface WhiteboardChange {
	readonly board: WhiteboardBoard;
	readonly cause: WhiteboardCause;
}

/** `IPC.whiteboardPut`: the editor's whole document, debounced by the renderer. */
export interface WhiteboardPutRequest {
	readonly companyId: string;
	/** The revision the editor's document was last loaded at or merged up to. */
	readonly baseRevision: number;
	readonly snapshot: WhiteboardSnapshot;
}

export type WhiteboardPutResult =
	/**
	 * Saved as `board`. `merged`: agents added shapes after `baseRevision`;
	 * they were kept, so `board.snapshot` has them and the editor should take them.
	 */
	| { readonly state: "saved"; readonly board: WhiteboardBoard; readonly merged: boolean }
	/**
	 * Not saved: the company switched, or the board was cleared after
	 * `baseRevision`. The editor should reload `board`.
	 */
	| { readonly state: "rejected"; readonly reason: string; readonly board: WhiteboardBoard };

/** `window.office.whiteboard`. */
export interface WhiteboardApi {
	get(): Promise<WhiteboardBoard>;
	put(request: WhiteboardPutRequest): Promise<WhiteboardPutResult>;
	onChanged(listener: (change: WhiteboardChange) => void): Unsubscribe;
}

/** Note colours agents can pick, and the tldraw colour each one is drawn in. */
export const NOTE_COLORS = {
	yellow: "yellow",
	green: "light-green",
	blue: "light-blue",
	pink: "light-red",
} as const;
export type NoteColor = keyof typeof NOTE_COLORS;

export const WHITEBOARD_TEXT_MAX = 2_000;

/**
 * One line of the board-requests file, appended by `office-board`. Notes and
 * text made while the app is closed still land when it opens.
 */
export const boardRequestLineSchema = z.discriminatedUnion("op", [
	z.strictObject({
		v: z.literal(1),
		id: z.string().min(8).max(64),
		/** herdr pane of the agent (`HERDR_PANE_ID`), mapped to its name by the app. */
		fromPane: z.string().min(1).max(64),
		op: z.enum(["note", "text"]),
		text: z.string().trim().min(1).max(WHITEBOARD_TEXT_MAX),
		color: z.enum(["yellow", "green", "blue", "pink"]).optional(),
		/** Page position; the app picks a free spot when omitted. */
		x: z.number().finite().optional(),
		y: z.number().finite().optional(),
		requestedAt: z.iso.datetime(),
	}),
	z.strictObject({
		v: z.literal(1),
		id: z.string().min(8).max(64),
		fromPane: z.string().min(1).max(64),
		op: z.literal("clear"),
		requestedAt: z.iso.datetime(),
	}),
]);
export type BoardRequestLine = z.infer<typeof boardRequestLineSchema>;

/**
 * The board as plain text, rewritten by the app after every change, for
 * `office-board read` (which cannot ask the app: it runs under plain Node).
 */
export interface BoardDigest {
	readonly companyId: string;
	readonly revision: number;
	readonly updatedAt: string;
	readonly items: readonly BoardDigestItem[];
}

export interface BoardDigestItem {
	readonly kind: "note" | "text";
	/** The agent who posted it; shapes drawn in the editor are Jeremy's. */
	readonly author: string;
	readonly text: string;
}
