import type { IBufferCell } from "@xterm/headless";

/** Colours are packed 0xRRGGBB integers so cell decoding never allocates. */
export const DEFAULT_FG = 0xe9e4da;
export const DEFAULT_BG = 0x1d1b22;

/** xterm.js's default 16-colour ANSI palette, matching the focused terminal. */
const ANSI_16 = [
	0x2e3436, 0xcc0000, 0x4e9a06, 0xc4a000, 0x3465a4, 0x75507b, 0x06989a, 0xd3d7cf, 0x555753,
	0xef2929, 0x8ae234, 0xfce94f, 0x729fcf, 0xad7fa8, 0x34e2e2, 0xeeeeec,
];

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

function buildPalette(): Uint32Array {
	const palette = new Uint32Array(256);
	palette.set(ANSI_16);
	for (let index = 16; index < 232; index++) {
		const n = index - 16;
		const r = CUBE_LEVELS[Math.floor(n / 36)] ?? 0;
		const g = CUBE_LEVELS[Math.floor(n / 6) % 6] ?? 0;
		const b = CUBE_LEVELS[n % 6] ?? 0;
		palette[index] = (r << 16) | (g << 8) | b;
	}
	for (let index = 232; index < 256; index++) {
		const level = 8 + (index - 232) * 10;
		palette[index] = (level << 16) | (level << 8) | level;
	}
	return palette;
}

/** The xterm 256-colour palette as 0xRRGGBB. */
export const PALETTE_256: Uint32Array = buildPalette();

type ColorCell = Pick<
	IBufferCell,
	| "isFgDefault"
	| "isFgPalette"
	| "getFgColor"
	| "isBgDefault"
	| "isBgPalette"
	| "getBgColor"
	| "isBold"
	| "isDim"
	| "isInverse"
	| "isInvisible"
>;

function fgOf(cell: ColorCell, bold: boolean): number {
	if (cell.isFgDefault()) return DEFAULT_FG;
	const color = cell.getFgColor();
	if (!cell.isFgPalette()) return color & 0xffffff;
	// Like xterm.js's drawBoldTextInBrightColors: bold low ANSI colours turn bright.
	const index = bold && color < 8 ? color + 8 : color;
	return PALETTE_256[index & 0xff] ?? DEFAULT_FG;
}

function bgOf(cell: ColorCell): number {
	if (cell.isBgDefault()) return DEFAULT_BG;
	const color = cell.getBgColor();
	return cell.isBgPalette() ? (PALETTE_256[color & 0xff] ?? DEFAULT_BG) : color & 0xffffff;
}

/** Halfway blend of `color` toward `toward`, per channel. */
export function blend(color: number, toward: number): number {
	const r = (((color >> 16) & 0xff) + ((toward >> 16) & 0xff)) >> 1;
	const g = (((color >> 8) & 0xff) + ((toward >> 8) & 0xff)) >> 1;
	const b = ((color & 0xff) + (toward & 0xff)) >> 1;
	return (r << 16) | (g << 8) | b;
}

/** Paint style of one cell, decoded in place so scanning reuses one instance. */
export class CellStyle {
	fg = DEFAULT_FG;
	bg = DEFAULT_BG;
	bold = false;

	/** Decodes a cell's colours and attributes (inverse, dim and invisible applied). */
	resolve(cell: ColorCell): void {
		const bold = cell.isBold() !== 0;
		let fg = fgOf(cell, bold);
		let bg = bgOf(cell);
		if (cell.isInverse() !== 0) {
			const swap = fg;
			fg = bg;
			bg = swap;
		}
		if (cell.isDim() !== 0) fg = blend(fg, bg);
		if (cell.isInvisible() !== 0) fg = bg;
		this.fg = fg;
		this.bg = bg;
		this.bold = bold;
	}
}

const cssCache = new Map<number, string>();
const CSS_CACHE_LIMIT = 1024;

/** `#rrggbb` for a packed colour, memoised so repaints reuse the same strings. */
export function cssColor(color: number): string {
	const cached = cssCache.get(color);
	if (cached !== undefined) return cached;
	if (cssCache.size >= CSS_CACHE_LIMIT) cssCache.clear();
	const css = `#${color.toString(16).padStart(6, "0")}`;
	cssCache.set(color, css);
	return css;
}
