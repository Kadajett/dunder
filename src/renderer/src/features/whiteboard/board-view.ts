/** Scene units → canvas pixels: `canvas = scene * scale + offset`. */
export interface BoardView {
	readonly scale: number;
	readonly x: number;
	readonly y: number;
}

/** A rectangle in scene units. */
export interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * The smallest stretch of scene the wall board ever shows (a few notes across),
 * so one lone note does not fill the whole board.
 */
const MIN_SPAN = { w: 1000, h: 500 } as const;
/** Margin around the drawing, as a fraction of the canvas. */
const MARGIN = 0.05;

/** Fit `content` on a `width` × `height` canvas, centred, never zoomed in past `MIN_SPAN`. */
export function fitView(content: Box, width: number, height: number): BoardView {
	const usable = { w: width * (1 - 2 * MARGIN), h: height * (1 - 2 * MARGIN) };
	const span = { w: Math.max(content.w, MIN_SPAN.w), h: Math.max(content.h, MIN_SPAN.h) };
	const scale = Math.min(usable.w / span.w, usable.h / span.h);
	return {
		scale,
		x: width / 2 - (content.x + content.w / 2) * scale,
		y: height / 2 - (content.y + content.h / 2) * scale,
	};
}
