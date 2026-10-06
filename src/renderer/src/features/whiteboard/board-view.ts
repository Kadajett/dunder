import type { WhiteboardSnapshot } from "@shared/whiteboard";
import { type Box, type PlacedShape, placeShapes } from "@shared/whiteboard-geometry";
import { isShape, type TLPage, type TLRecord } from "@tldraw/tlschema";

/** Page units → canvas pixels: `canvas = page * scale + offset`. */
export interface BoardView {
	readonly scale: number;
	readonly x: number;
	readonly y: number;
}

/**
 * The smallest stretch of page the board ever shows (in page units, a few
 * notes across), so one lone note does not fill the whole board.
 */
const MIN_SPAN = { w: 1000, h: 500 } as const;
/** Margin around the drawing, as a fraction of the canvas. */
const MARGIN = 0.05;

function isPage(record: TLRecord): record is TLPage {
	return record.typeName === "page";
}

/** Fractional indexes sort as plain strings (code units, not locale order). */
function byIndex(a: { readonly index: string }, b: { readonly index: string }): number {
	if (a.index === b.index) return 0;
	return a.index < b.index ? -1 : 1;
}

/** The shapes of the document's first page, back to front, placed on the page. */
export function boardShapes(snapshot: WhiteboardSnapshot | null): PlacedShape[] {
	if (!snapshot) return [];
	const records = Object.values(snapshot.store);
	const page = records.filter(isPage).sort(byIndex)[0];
	if (!page) return [];
	const placed = placeShapes(records.filter(isShape), page.id);
	return placed.sort((a, b) => byIndex(a.shape, b.shape));
}

function union(boxes: readonly Box[]): Box | undefined {
	if (boxes.length === 0) return undefined;
	const left = Math.min(...boxes.map((box) => box.x));
	const top = Math.min(...boxes.map((box) => box.y));
	const right = Math.max(...boxes.map((box) => box.x + box.w));
	const bottom = Math.max(...boxes.map((box) => box.y + box.h));
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Fit every box on a `width` × `height` canvas, centred, never zoomed in past `MIN_SPAN`. */
export function fitView(boxes: readonly Box[], width: number, height: number): BoardView {
	const bounds = union(boxes) ?? { x: 0, y: 0, w: 0, h: 0 };
	const usable = { w: width * (1 - 2 * MARGIN), h: height * (1 - 2 * MARGIN) };
	const span = { w: Math.max(bounds.w, MIN_SPAN.w), h: Math.max(bounds.h, MIN_SPAN.h) };
	const scale = Math.min(usable.w / span.w, usable.h / span.h);
	return {
		scale,
		x: width / 2 - (bounds.x + bounds.w / 2) * scale,
		y: height / 2 - (bounds.y + bounds.h / 2) * scale,
	};
}
