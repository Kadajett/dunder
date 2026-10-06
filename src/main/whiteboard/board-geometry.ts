import { b64Vecs, type TLPageId, type TLShape, type VecModel } from "@tldraw/tlschema";
import { plainText } from "./rich-text";

/**
 * Where shapes sit on the board, estimated without a DOM. The editor measures
 * text with the browser; main only needs to know roughly where things are
 * (to place agents' posts in free space) and how tall a long note gets.
 * Estimates err large: a post one cell further away beats one on top of
 * another shape. Parent rotation is ignored.
 */

export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

type Size = Pick<Box, "w" | "h">;

/** tldraw 5.5.2 size-m defaults: 200² notes with 16px padding and a 22px label, 24px text, line height 1.35. */
const NOTE = { size: 200, padding: 16, fontPx: 22 } as const;
const TEXT_FONT_PX = 24;
const LINE_HEIGHT = 1.35;
/** Average sans glyph width in ems, on the wide side so estimates err tall. */
const GLYPH_EM = 0.55;
/** Extent assumed for a shape whose props do not tell it. */
const UNKNOWN_SIZE = 200;

/** Lines `paragraph` wraps to at `columns` characters per line, greedily by word. */
function paragraphLines(paragraph: string, columns: number): number {
	let lines = 1;
	let used = 0;
	for (const word of paragraph.split(/\s+/).filter(Boolean)) {
		const needed = used === 0 ? word.length : used + 1 + word.length;
		if (needed <= columns) {
			used = needed;
			continue;
		}
		if (used > 0) lines += 1;
		const overflow = Math.ceil(word.length / columns) - 1;
		lines += overflow;
		used = word.length - overflow * columns;
	}
	return lines;
}

const NOTE_COLUMNS = Math.floor((NOTE.size - NOTE.padding * 2 - 1) / (NOTE.fontPx * GLYPH_EM));

/** The note's `growY`: how far its label runs past the 200px square. The editor recomputes it on edit. */
export function noteGrowY(text: string): number {
	const lines = text
		.split("\n")
		.reduce((sum, paragraph) => sum + paragraphLines(paragraph, NOTE_COLUMNS), 0);
	const labelHeight = lines * NOTE.fontPx * LINE_HEIGHT + NOTE.padding * 2;
	return Math.max(0, Math.ceil(labelHeight - NOTE.size));
}

/** An auto-sized text shape: one line per paragraph, as wide as the longest. */
function textSize(text: string): Size {
	const paragraphs = text.split("\n");
	const longest = Math.max(...paragraphs.map((paragraph) => paragraph.length));
	return {
		w: Math.max(longest, 1) * TEXT_FONT_PX * GLYPH_EM,
		h: paragraphs.length * TEXT_FONT_PX * LINE_HEIGHT,
	};
}

/** The size a new agent post takes on the board. */
export function postSize(kind: "note" | "text", text: string): Size {
	return kind === "note" ? { w: NOTE.size, h: NOTE.size + noteGrowY(text) } : textSize(text);
}

function pointsBox(points: readonly VecModel[], scaleX = 1, scaleY = 1): Box | undefined {
	if (points.length === 0) return undefined;
	const xs = points.map((point) => point.x * scaleX);
	const ys = points.map((point) => point.y * scaleY);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The shape's extent relative to its own origin, unrotated; undefined when it has none of its own (groups). */
function localBox(shape: TLShape): Box | undefined {
	switch (shape.type) {
		case "group":
			return undefined;
		case "note": {
			const { scale, growY } = shape.props;
			return { x: 0, y: 0, w: NOTE.size * scale, h: (NOTE.size + growY) * scale };
		}
		case "text": {
			const { richText, autoSize, w, scale } = shape.props;
			const size = textSize(plainText(richText));
			return { x: 0, y: 0, w: (autoSize ? size.w : w) * scale, h: size.h * scale };
		}
		case "draw":
		case "highlight": {
			const { segments, scale, scaleX, scaleY } = shape.props;
			const points = segments.flatMap((segment) => b64Vecs.decodePoints(segment.path, segment.dim));
			return pointsBox(points, scale * scaleX, scale * scaleY);
		}
		case "line":
			return pointsBox(Object.values(shape.props.points), shape.props.scale, shape.props.scale);
		case "arrow":
			return pointsBox([shape.props.start, shape.props.end]);
		default:
			return sizedBox(shape.props);
	}
}

/** Geo, frame, image, video, embed, bookmark: `w`/`h` props (geo grows by `growY`). */
function sizedBox(props: object): Box {
	const w = "w" in props && typeof props.w === "number" ? props.w : UNKNOWN_SIZE;
	const h = "h" in props && typeof props.h === "number" ? props.h : UNKNOWN_SIZE;
	const growY = "growY" in props && typeof props.growY === "number" ? props.growY : 0;
	return { x: 0, y: 0, w, h: h + growY };
}

/** `box` rotated by `rotation` about the origin, as an axis-aligned box. */
function rotated(box: Box, rotation: number): Box {
	if (rotation === 0) return box;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const corners = [
		{ x: box.x, y: box.y },
		{ x: box.x + box.w, y: box.y },
		{ x: box.x, y: box.y + box.h },
		{ x: box.x + box.w, y: box.y + box.h },
	].map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
	return pointsBox(corners) ?? box;
}

/** The page-space box of every shape on `page` (children of frames and groups offset by their parents). */
export function pageBoxes(shapes: readonly TLShape[], page: TLPageId): Box[] {
	const byId = new Map<string, TLShape>(shapes.map((shape) => [shape.id, shape]));
	/** Page position of the shape's origin, undefined when it sits on another page. */
	const origin = (shape: TLShape): { x: number; y: number } | undefined => {
		const parent = byId.get(shape.parentId);
		const base = parent ? origin(parent) : shape.parentId === page ? { x: 0, y: 0 } : undefined;
		return base && { x: base.x + shape.x, y: base.y + shape.y };
	};
	return shapes.flatMap((shape) => {
		const local = localBox(shape);
		const at = origin(shape);
		if (!local || !at) return [];
		const box = rotated(local, shape.rotation);
		return [{ ...box, x: box.x + at.x, y: box.y + at.y }];
	});
}

/** Agent posts without a position fill a grid, five to a row, from the top left. */
const GRID = { columns: 5, step: 240, origin: 80, cells: 500 } as const;

function overlaps(a: Box, b: Box): boolean {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The first grid cell where a post of `size` touches no existing shape; below everything when the grid is full. */
export function freeSpot(
	boxes: readonly Box[],
	size: Size,
): { readonly x: number; readonly y: number } {
	for (let cell = 0; cell < GRID.cells; cell++) {
		const spot = {
			x: GRID.origin + (cell % GRID.columns) * GRID.step,
			y: GRID.origin + Math.floor(cell / GRID.columns) * GRID.step,
		};
		if (!boxes.some((box) => overlaps(box, { ...spot, ...size }))) return spot;
	}
	const bottom = Math.max(...boxes.map((box) => box.y + box.h));
	return { x: GRID.origin, y: Math.ceil(bottom) + GRID.step - NOTE.size };
}
