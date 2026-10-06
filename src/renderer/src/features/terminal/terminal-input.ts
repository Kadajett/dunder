import type { CellPosition, TerminalCommand } from "@shared/terminal";

/** Pixel delta that counts as one scrolled line for pixel-mode wheels. */
const PIXELS_PER_LINE = 40;
const MAX_LINES_PER_EVENT = 15;

export interface WheelLike {
	readonly deltaY: number;
	/** 0 = pixels, 1 = lines, 2 = pages (DOM WheelEvent semantics). */
	readonly deltaMode: number;
}

/**
 * Translate a wheel event into a herdr scroll. herdr owns scrollback (and
 * forwards wheels to mouse-aware apps), so the local emulator never scrolls.
 */
export function wheelToScroll(
	wheel: WheelLike,
	viewportRows: number,
	at?: CellPosition,
): TerminalCommand | undefined {
	if (wheel.deltaY === 0) return undefined;
	const perUnit = [1 / PIXELS_PER_LINE, 1, viewportRows][wheel.deltaMode] ?? 1;
	const raw = Math.round(Math.abs(wheel.deltaY) * perUnit);
	const lines = Math.min(MAX_LINES_PER_EVENT, Math.max(1, raw));
	return {
		type: "terminal.scroll",
		direction: wheel.deltaY < 0 ? "up" : "down",
		lines,
		source: "wheel",
		...at,
	};
}

/** Map a pointer position inside the grid element to a zero-based cell. */
export function cellAt(
	point: { readonly x: number; readonly y: number },
	grid: {
		readonly left: number;
		readonly top: number;
		readonly width: number;
		readonly height: number;
	},
	size: { readonly cols: number; readonly rows: number },
): CellPosition {
	const column = Math.floor(((point.x - grid.left) / grid.width) * size.cols);
	const row = Math.floor(((point.y - grid.top) / grid.height) * size.rows);
	return {
		column: Math.min(size.cols - 1, Math.max(0, column)),
		row: Math.min(size.rows - 1, Math.max(0, row)),
	};
}

export type ShortcutAction = "copy" | "paste" | "page-up" | "page-down";

export interface KeyLike {
	readonly type: string;
	readonly code: string;
	readonly key: string;
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
}

/**
 * Terminal-emulator shortcuts handled locally instead of being sent to the
 * pane. Plain Ctrl+C / Ctrl+V still reach the program as control bytes.
 */
export function shortcutFor(key: KeyLike): ShortcutAction | undefined {
	if (key.type !== "keydown" || key.altKey || key.metaKey) return undefined;
	if (key.ctrlKey && key.shiftKey && key.code === "KeyC") return "copy";
	if (key.ctrlKey && key.shiftKey && key.code === "KeyV") return "paste";
	if (key.shiftKey && !key.ctrlKey && key.key === "Insert") return "paste";
	if (key.shiftKey && !key.ctrlKey && key.key === "PageUp") return "page-up";
	if (key.shiftKey && !key.ctrlKey && key.key === "PageDown") return "page-down";
	return undefined;
}
