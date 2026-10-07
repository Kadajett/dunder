import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * The office whiteboard: one Excalidraw scene per company, owned by the main
 * process as plain JSON. Jeremy edits it in the renderer's Excalidraw editor;
 * agents add sticky notes and text from the shell with `office-board`. Main
 * merges both element by element (higher `version` wins, a tie goes to the
 * lower `versionNonce`; deletions are `isDeleted` versions).
 */

/** One Excalidraw element (type-only: main never loads Excalidraw). */
export type WhiteboardElement = ExcalidrawElement;

/** The board's drawing: every element, deleted ones included, plus pasted images. */
export interface WhiteboardScene {
	readonly elements: readonly WhiteboardElement[];
	readonly files?: BinaryFiles;
}

/** The current company's board. */
export interface WhiteboardBoard {
	readonly companyId: string;
	/** Goes up by one on every accepted change: an editor put, an agent's note or text, a clear. */
	readonly revision: number;
	/** `null` until anything is drawn: start the editor on an empty scene. */
	readonly scene: WhiteboardScene | null;
}

/** Why the board changed, for listeners that apply changes incrementally. */
export type WhiteboardCause =
	/** Jeremy's editor saved (another window may need to reload). */
	| { readonly kind: "editor" }
	/** An agent added elements: exactly these (a note is a rectangle plus its bound text), already in `board.scene`. */
	| {
			readonly kind: "note" | "text";
			readonly by: string;
			readonly records: readonly WhiteboardElement[];
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

/** `IPC.whiteboardPut`: the editor's whole scene, debounced by the renderer. */
export interface WhiteboardPutRequest {
	readonly companyId: string;
	/** The revision the editor's scene was last loaded at or merged up to. */
	readonly baseRevision: number;
	readonly scene: WhiteboardScene;
}

export type WhiteboardPutResult =
	/**
	 * Saved as `board`. `merged`: agents added elements after `baseRevision`;
	 * they were kept, so `board.scene` has them and the editor should take them.
	 */
	| { readonly state: "saved"; readonly board: WhiteboardBoard; readonly merged: boolean }
	/**
	 * Not saved: the company switched, or the board was cleared after
	 * `baseRevision`. The editor should reload `board`.
	 */
	| { readonly state: "rejected"; readonly reason: string; readonly board: WhiteboardBoard };

/** Create a P3 idea task from a sticky note's text and author. */
export interface MakeIdeaRequest {
	readonly text: string;
	readonly author: string;
}

/** `window.office.whiteboard`. */
export interface WhiteboardApi {
	get(): Promise<WhiteboardBoard>;
	put(request: WhiteboardPutRequest): Promise<WhiteboardPutResult>;
	makeIdea(request: MakeIdeaRequest): Promise<string>;
	onChanged(listener: (change: WhiteboardChange) => void): Unsubscribe;
}

/** Note colours agents can pick, and the Excalidraw background (its palette's light shades) each one is filled with. */
export const NOTE_COLORS = {
	yellow: "#ffec99",
	green: "#b2f2bb",
	blue: "#a5d8ff",
	pink: "#ffc9c9",
} as const;
export type NoteColor = keyof typeof NOTE_COLORS;

/** `customData` on the elements of an agent's post (a note's rectangle and its text, or a text). */
export interface PostData {
	readonly author: string;
	readonly kind: "note" | "text";
}

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
	/** `note`: text in a shape (an agent's sticky note, or a label Jeremy wrote in one); `text`: free text. */
	readonly kind: "note" | "text";
	/** The agent who posted it; elements drawn in the editor are Jeremy's. */
	readonly author: string;
	readonly text: string;
}
