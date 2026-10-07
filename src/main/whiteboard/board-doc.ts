import { randomInt, randomUUID } from "node:crypto";
import type {
	ExcalidrawElement,
	ExcalidrawRectangleElement,
	ExcalidrawTextElement,
	FractionalIndex,
} from "@excalidraw/excalidraw/element/types";
import {
	type BoardDigestItem,
	NOTE_COLORS,
	type NoteColor,
	type PostData,
	type WhiteboardElement,
	type WhiteboardScene,
} from "@shared/whiteboard";
import {
	elementBox,
	freeSpot,
	NOTE_TEXT_WIDTH,
	POST_FONT,
	postSize,
	textSize,
	wrapText,
} from "@shared/whiteboard-geometry";
import { changesScene, mergeElements } from "@shared/whiteboard-merge";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";

/**
 * The board's Excalidraw scene as plain JSON in the main process: no editor
 * library here, only the element fields the board reads, merged element by
 * element with Excalidraw's own rule.
 */

/** Elements drawn in the editor carry no author: only Jeremy draws there. */
export const EDITOR_AUTHOR = "jeremy";

export const EMPTY_SCENE: WhiteboardScene = { elements: [] };

/**
 * What main relies on in an element; everything else (points, colours, an
 * element type this build has never heard of) passes through untouched.
 */
const elementSchema = z.looseObject({
	id: z.string().min(1),
	type: z.string().min(1),
	x: z.number().finite(),
	y: z.number().finite(),
	width: z.number().finite(),
	height: z.number().finite(),
	angle: z.number().finite(),
	version: z.number().int(),
	versionNonce: z.number().int(),
	isDeleted: z.boolean(),
	index: z.string().nullable(),
});
const fileSchema = z.looseObject({
	id: z.string().min(1),
	mimeType: z.string(),
	dataURL: z.string(),
});
export const sceneSchema = z.object({
	elements: z.array(elementSchema),
	files: z.record(z.string(), fileSchema).optional(),
});

/** An untrusted scene (the editor's save, a board file); throws when it is not one. */
export function parseScene(json: unknown): WhiteboardScene {
	const scene = sceneSchema.parse(json);
	// Checked above for every field main reads; the rest is Excalidraw's and passes through as it came.
	return scene as unknown as WhiteboardScene;
}

/**
 * The editor's save merged with what main holds: per element, the higher
 * version wins (a tie, the lower nonce). Elements only main has (agents'
 * posts the editor had not seen yet) stay, on top. `merged` says the editor
 * is missing some of them and should take `scene`.
 */
export function mergeScenes(
	stored: WhiteboardScene,
	saved: WhiteboardScene,
): { readonly scene: WhiteboardScene; readonly merged: boolean } {
	const elements = mergeElements(saved.elements, stored.elements);
	const files = { ...stored.files, ...saved.files };
	return { scene: { elements, files }, merged: changesScene(saved.elements, stored.elements) };
}

export interface AgentPost {
	readonly kind: "note" | "text";
	readonly author: string;
	readonly text: string;
	readonly color?: NoteColor | undefined;
	readonly x?: number | undefined;
	readonly y?: number | undefined;
}

/** The fractional index after `previous`; null (Excalidraw assigns one) when `previous` is not a valid key. */
function indexAfter(previous: string | null): FractionalIndex | null {
	try {
		// Excalidraw's own key format (rocicorp/fractional-indexing), branded by its types.
		return generateKeyBetween(previous, null) as FractionalIndex;
	} catch {
		return null;
	}
}

/** The fields every new element shares: fresh identity, version 1, solid strokes, no grouping. */
function fresh(
	post: AgentPost,
	box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
	index: FractionalIndex | null,
) {
	return {
		id: randomUUID(),
		x: box.x,
		y: box.y,
		width: box.w,
		height: box.h,
		angle: 0 as ExcalidrawElement["angle"],
		strokeColor: "#1e1e1e",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		roundness: null,
		seed: randomInt(2 ** 31),
		version: 1,
		versionNonce: randomInt(2 ** 31),
		index,
		isDeleted: false,
		groupIds: [],
		frameId: null,
		boundElements: null,
		updated: Date.now(),
		link: null,
		locked: false,
		customData: { author: post.author, kind: post.kind } satisfies PostData,
	} as const;
}

function textElement(
	post: AgentPost,
	box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
	options: {
		readonly index: FractionalIndex | null;
		readonly text: string;
		readonly containerId: string | null;
	},
): ExcalidrawTextElement {
	return {
		...fresh(post, box, options.index),
		type: "text",
		fontSize: POST_FONT.size,
		fontFamily: POST_FONT.family as ExcalidrawTextElement["fontFamily"],
		text: options.text,
		originalText: post.text,
		textAlign: options.containerId ? "center" : "left",
		verticalAlign: options.containerId ? "middle" : "top",
		containerId: options.containerId,
		autoResize: true,
		lineHeight: POST_FONT.lineHeight as ExcalidrawTextElement["lineHeight"],
	};
}

/** A sticky note: a filled rectangle with the text bound inside it, centred. */
function noteElements(
	post: AgentPost,
	spot: { x: number; y: number },
	after: string | null,
): WhiteboardElement[] {
	const size = postSize("note", post.text);
	const wrapped = wrapText(post.text, NOTE_TEXT_WIDTH);
	const inner = textSize(wrapped);
	const rectIndex = indexAfter(after);
	const rect = fresh(post, { ...spot, ...size }, rectIndex);
	const text = textElement(
		post,
		{ x: spot.x + (size.w - inner.w) / 2, y: spot.y + (size.h - inner.h) / 2, ...inner },
		{ index: rectIndex && indexAfter(rectIndex), text: wrapped, containerId: rect.id },
	);
	const note: ExcalidrawRectangleElement = {
		...rect,
		type: "rectangle",
		strokeColor: "transparent",
		backgroundColor: NOTE_COLORS[post.color ?? "yellow"],
		boundElements: [{ type: "text", id: text.id }],
	};
	return [note, text];
}

/**
 * An agent's sticky note or text on top of everything, signed in
 * `customData`; placed at its own position or the first free grid cell.
 * Returns the new scene and exactly the elements added.
 */
export function addPost(
	scene: WhiteboardScene,
	post: AgentPost,
): { readonly scene: WhiteboardScene; readonly records: readonly WhiteboardElement[] } {
	const size = postSize(post.kind, post.text);
	const boxes = scene.elements.flatMap((element) => elementBox(element) ?? []);
	const spot =
		post.x !== undefined && post.y !== undefined ? { x: post.x, y: post.y } : freeSpot(boxes, size);
	const last = scene.elements.findLast((element) => element.index !== null)?.index ?? null;
	const records =
		post.kind === "note"
			? noteElements(post, spot, last)
			: [
					textElement(
						post,
						{ ...spot, ...size },
						{ index: indexAfter(last), text: post.text, containerId: null },
					),
				];
	return { scene: { ...scene, elements: [...scene.elements, ...records] }, records };
}

function authorOf(...elements: readonly (WhiteboardElement | undefined)[]): string {
	for (const element of elements) {
		const author = element?.customData?.["author"];
		if (typeof author === "string") return author;
	}
	return EDITOR_AUTHOR;
}

/** Text on the board, top-left first, for `office-board read`: text in a shape is a note, free text is text. */
export function digestItems(scene: WhiteboardScene): BoardDigestItem[] {
	const live = scene.elements.filter((element) => !element.isDeleted);
	const byId = new Map(live.map((element) => [element.id, element]));
	return live
		.flatMap((element) => {
			if (element.type !== "text") return [];
			const container = element.containerId ? byId.get(element.containerId) : undefined;
			const text = (element.originalText || element.text).trim();
			if (!text) return [];
			const at = container ?? element;
			const item: BoardDigestItem = {
				kind: container ? "note" : "text",
				author: authorOf(element, container),
				text,
			};
			return [{ item, x: at.x, y: at.y }];
		})
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map(({ item }) => item);
}
