import type { WhiteboardElement } from "./whiteboard";

/**
 * Where elements sit on the board, estimated without a DOM: main places
 * agents' posts and sizes their text without loading Excalidraw. Estimates err
 * wide and tall, so a post never lands on something it doesn't quite reach.
 */

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

type Size = Pick<Box, "w" | "h">;

/** Excalidraw's defaults for new text (Excalifont 20px, line height 1.25) and bound-text padding. */
export const POST_FONT = { family: 5, size: 20, lineHeight: 1.25 } as const;
/** A sticky note: a 200px square that grows with its text, which sits inside the padding. */
export const NOTE = { size: 200, padding: 10 } as const;
/** Average glyph width in ems, on the wide side so estimates err big. */
const GLYPH_EM = 0.6;
const GLYPH_PX = POST_FONT.size * GLYPH_EM;
const LINE_PX = POST_FONT.size * POST_FONT.lineHeight;

/** `paragraph` wrapped greedily by word at `columns` characters; words longer than a line are cut. */
function wrapParagraph(paragraph: string, columns: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of paragraph.split(/\s+/).filter(Boolean)) {
		for (let rest = word; rest.length > 0; rest = rest.slice(columns)) {
			const piece = rest.slice(0, columns);
			if (line && line.length + 1 + piece.length <= columns) line = `${line} ${piece}`;
			else {
				if (line) lines.push(line);
				line = piece;
			}
		}
	}
	return [...lines, line];
}

/** `text` wrapped to fit `width` px, as Excalidraw stores a bound text's `text` (its `originalText` stays whole). */
export function wrapText(text: string, width: number): string {
	const columns = Math.max(1, Math.floor(width / GLYPH_PX));
	return text
		.split("\n")
		.flatMap((paragraph) => wrapParagraph(paragraph, columns))
		.join("\n");
}

/** The px size of `text` set in the post font (one line per `\n`). */
export function textSize(text: string): Size {
	const lines = text.split("\n");
	const longest = Math.max(1, ...lines.map((line) => line.length));
	return { w: Math.ceil(longest * GLYPH_PX), h: Math.ceil(lines.length * LINE_PX) };
}

/** Width a note's text wraps at: the square inside its padding. */
export const NOTE_TEXT_WIDTH = NOTE.size - 2 * NOTE.padding;

/** The size a new agent post takes on the board: a note grows taller for long text, text is as big as it reads. */
export function postSize(kind: "note" | "text", text: string): Size {
	if (kind === "text") return textSize(text);
	const inner = textSize(wrapText(text, NOTE_TEXT_WIDTH)).h;
	return { w: NOTE.size, h: Math.max(NOTE.size, inner + 2 * NOTE.padding) };
}

/** `box` turned by `angle` (radians) about its centre, as an axis-aligned box. */
function rotated(box: Box, angle: number): Box {
	if (!angle) return box;
	const cos = Math.abs(Math.cos(angle));
	const sin = Math.abs(Math.sin(angle));
	const w = box.w * cos + box.h * sin;
	const h = box.w * sin + box.h * cos;
	return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** Lines, arrows and pen strokes: their points (relative to x, y) span their extent. */
function pointsBox(element: WhiteboardElement): Box | undefined {
	if (!("points" in element) || element.points.length === 0) return undefined;
	const xs = element.points.map(([x]) => x);
	const ys = element.points.map(([, y]) => y);
	const left = Math.min(...xs);
	const top = Math.min(...ys);
	return {
		x: element.x + left,
		y: element.y + top,
		w: Math.max(...xs) - left,
		h: Math.max(...ys) - top,
	};
}

/** The area an element covers on the board (deleted elements cover none). */
export function elementBox(element: WhiteboardElement): Box | undefined {
	if (element.isDeleted) return undefined;
	const box = pointsBox(element) ?? {
		x: element.x,
		y: element.y,
		w: element.width,
		h: element.height,
	};
	return rotated(box, element.angle);
}

/** Agent posts without a position fill a grid, five to a row, from the top left. */
const GRID = { columns: 5, step: 240, origin: 80, cells: 500 } as const;

function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The first grid cell where a post of `size` touches no existing element; below everything when the grid is full. */
export function freeSpot(
	boxes: readonly Box[],
	size: Size,
): { readonly x: number; readonly y: number } {
	for (let cell = 0; cell < GRID.cells; cell += 1) {
		const x = GRID.origin + (cell % GRID.columns) * GRID.step;
		const y = GRID.origin + Math.floor(cell / GRID.columns) * GRID.step;
		if (!boxes.some((box) => overlaps(box, { x, y, ...size }))) return { x, y };
	}
	const bottom = Math.max(0, ...boxes.map((box) => box.y + box.h));
	return { x: GRID.origin, y: Math.ceil(bottom) + GRID.step - NOTE.size };
}
