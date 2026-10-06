import type { ScreenRect } from "./focus-store";

/**
 * Width the expanded Chief of Staff chat claims on the right: the 360px card
 * (.chief-chat), the dock's 20px right margin (.chief) and a 24px gutter.
 */
export const CHIEF_DOCK_RESERVE = 404;

/** Below this much free width the screen keeps the whole viewport rather than shrink to a strip. */
const MIN_AREA_WIDTH = 480;

interface Viewport {
	readonly width: number;
	readonly height: number;
}

/**
 * The part of the viewport a focused screen is framed in: everything left of
 * the chat while the Chief of Staff dock is open, otherwise the full viewport.
 */
export function focusArea(viewport: Viewport, dockOpen: boolean): ScreenRect {
	const full = { left: 0, top: 0, width: viewport.width, height: viewport.height };
	const width = viewport.width - CHIEF_DOCK_RESERVE;
	if (!dockOpen || width < MIN_AREA_WIDTH) return full;
	return { ...full, width };
}
