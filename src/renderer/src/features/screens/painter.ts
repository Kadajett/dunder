import type { ScreenState } from "@shared/screens";
import type { IBuffer, IBufferLine } from "@xterm/headless";
import { CanvasTexture, SRGBColorSpace } from "three";
import { cssColor, DEFAULT_BG, DEFAULT_FG } from "./colors";
import { RowScanner, type RunSink } from "./runs";

export const SCREEN_TEXTURE_WIDTH = 512;
export const SCREEN_TEXTURE_HEIGHT = 320;

/** Glyphs are laid out at this virtual size, then the grid is scaled to fill the canvas. */
const FONT_PX = 16;
const LINE_HEIGHT = 1.2;
const FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';
const REGULAR_FONT = `${FONT_PX}px ${FONT_FAMILY}`;
const BOLD_FONT = `bold ${FONT_PX}px ${FONT_FAMILY}`;
const OVERLAY_FONT = `28px ${FONT_FAMILY}`;

/** What the painter needs from a screen: its current buffer and size. */
export interface PaintSource {
	readonly buffer: IBuffer | null;
	readonly cols: number;
	readonly rows: number;
}

const OVERLAY_TEXT: Partial<Record<ScreenState, string>> = {
	disconnected: "disconnected",
	closed: "closed",
};

/**
 * Rasterises a headless terminal buffer into a reused `OffscreenCanvas` backing a
 * `CanvasTexture`. Style runs are batched per row (one `fillRect` per background run,
 * one `fillText` per text run) and canvas state is only touched when it changes.
 */
export class ScreenPainter implements RunSink {
	readonly texture: CanvasTexture<OffscreenCanvas>;
	readonly #ctx: OffscreenCanvasRenderingContext2D;
	#scanner: RowScanner | null = null;
	readonly #cellWidth: number;
	readonly #cellHeight = FONT_PX * LINE_HEIGHT;
	#line: IBufferLine | null = null;
	#row = 0;
	#font = "";
	#fill = "";

	constructor() {
		const canvas = new OffscreenCanvas(SCREEN_TEXTURE_WIDTH, SCREEN_TEXTURE_HEIGHT);
		const ctx = canvas.getContext("2d", { alpha: false });
		if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
		this.#ctx = ctx;
		ctx.textBaseline = "middle";
		this.#setFont(REGULAR_FONT);
		this.#cellWidth = ctx.measureText("M").width || FONT_PX * 0.6;
		this.texture = new CanvasTexture(canvas);
		this.texture.colorSpace = SRGBColorSpace;
		this.paint({ buffer: null, cols: 0, rows: 0 }, "connecting");
	}

	/** Repaints the whole texture from `source` and flags it for upload. */
	paint(source: PaintSource, state: ScreenState): void {
		const ctx = this.#ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.#setFill(cssColor(DEFAULT_BG));
		ctx.fillRect(0, 0, SCREEN_TEXTURE_WIDTH, SCREEN_TEXTURE_HEIGHT);
		const { buffer } = source;
		if (buffer) {
			// The buffer may still be at the previous size while a resize is queued.
			const rows = Math.min(source.rows, buffer.length - buffer.viewportY);
			this.#paintCells(buffer, source.cols, rows);
		}
		const overlay = OVERLAY_TEXT[state];
		if (overlay) this.#paintOverlay(overlay);
		this.texture.needsUpdate = true;
	}

	dispose(): void {
		this.texture.dispose();
	}

	background(start: number, end: number, color: number): void {
		this.#setFill(cssColor(color));
		const x = start * this.#cellWidth;
		this.#ctx.fillRect(
			x,
			this.#row * this.#cellHeight,
			(end - start) * this.#cellWidth,
			this.#cellHeight,
		);
	}

	text(start: number, end: number, color: number, bold: boolean): void {
		const line = this.#line;
		if (!line) return;
		this.#setFont(bold ? BOLD_FONT : REGULAR_FONT);
		this.#setFill(cssColor(color));
		const y = (this.#row + 0.5) * this.#cellHeight;
		this.#ctx.fillText(line.translateToString(false, start, end), start * this.#cellWidth, y);
	}

	#paintCells(buffer: IBuffer, cols: number, rows: number): void {
		if (cols <= 0 || rows <= 0) return;
		// Any buffer's cell object can load cells from any line; allocate it once.
		this.#scanner ??= new RowScanner(buffer.getNullCell());
		const scanner = this.#scanner;
		this.#ctx.setTransform(
			SCREEN_TEXTURE_WIDTH / (cols * this.#cellWidth),
			0,
			0,
			SCREEN_TEXTURE_HEIGHT / (rows * this.#cellHeight),
			0,
			0,
		);
		for (let row = 0; row < rows; row++) {
			const line = buffer.getLine(buffer.viewportY + row);
			if (!line) continue;
			this.#line = line;
			this.#row = row;
			scanner.scan(line, cols, this);
		}
		this.#line = null;
	}

	#paintOverlay(text: string): void {
		const ctx = this.#ctx;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.#setFill("rgba(10, 9, 14, 0.6)");
		ctx.fillRect(0, 0, SCREEN_TEXTURE_WIDTH, SCREEN_TEXTURE_HEIGHT);
		this.#setFont(OVERLAY_FONT);
		this.#setFill(cssColor(DEFAULT_FG));
		ctx.globalAlpha = 0.55;
		ctx.textAlign = "center";
		ctx.fillText(text, SCREEN_TEXTURE_WIDTH / 2, SCREEN_TEXTURE_HEIGHT / 2);
		ctx.textAlign = "start";
		ctx.globalAlpha = 1;
	}

	#setFont(font: string): void {
		if (this.#font === font) return;
		this.#font = font;
		this.#ctx.font = font;
	}

	#setFill(fill: string): void {
		if (this.#fill === fill) return;
		this.#fill = fill;
		this.#ctx.fillStyle = fill;
	}
}
