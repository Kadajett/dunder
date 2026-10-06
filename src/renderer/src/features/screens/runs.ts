import type { IBufferCell, IBufferLine } from "@xterm/headless";
import { CellStyle, DEFAULT_BG } from "./colors";

/** Receives one row's same-style runs; cell ranges are half-open `[start, end)`. */
export interface RunSink {
	/** A run of one non-default background colour. */
	background(start: number, end: number, color: number): void;
	/**
	 * Visible glyphs sharing fg and weight. Blank cells inside a run are kept (they draw
	 * nothing); runs never start or end on a blank. A double-width glyph is always its own run.
	 */
	text(start: number, end: number, color: number, bold: boolean): void;
}

/**
 * Splits buffer rows into background and text runs, so a painter issues one draw call
 * per run instead of per cell. Reuses its cell and style objects: no per-cell allocation.
 */
export class RowScanner {
	readonly #cell: IBufferCell;
	readonly #style = new CellStyle();
	#sink: RunSink | null = null;
	#bgStart = 0;
	#bgColor = DEFAULT_BG;
	#textStart = -1;
	#textEnd = 0;
	#textColor = 0;
	#textBold = false;

	/** `cell` is scratch storage, e.g. `buffer.getNullCell()`. */
	constructor(cell: IBufferCell) {
		this.#cell = cell;
	}

	/** Emits the runs of the first `cols` cells of `line` to `sink`. */
	scan(line: IBufferLine, cols: number, sink: RunSink): void {
		const cell = this.#cell;
		const style = this.#style;
		this.#sink = sink;
		this.#bgStart = 0;
		this.#bgColor = DEFAULT_BG;
		this.#textStart = -1;
		let x = 0;
		for (; x < cols && line.getCell(x, cell); x++) {
			const width = cell.getWidth();
			// The trailing half of a wide glyph: covered by its leading cell's runs.
			if (width === 0) continue;
			style.resolve(cell);
			if (style.bg !== this.#bgColor) {
				this.#flushBackground(x);
				this.#bgStart = x;
				this.#bgColor = style.bg;
			}
			const code = cell.getCode();
			if (code !== 0 && code !== 32) this.#trackText(x, width);
		}
		this.#flushText();
		this.#flushBackground(x);
		this.#sink = null;
	}

	#trackText(x: number, width: number): void {
		const style = this.#style;
		if (
			width === 1 &&
			this.#textStart >= 0 &&
			this.#textColor === style.fg &&
			this.#textBold === style.bold
		) {
			this.#textEnd = x + 1;
			return;
		}
		this.#flushText();
		this.#textStart = x;
		this.#textEnd = x + width;
		this.#textColor = style.fg;
		this.#textBold = style.bold;
		if (width !== 1) this.#flushText();
	}

	#flushText(): void {
		if (this.#textStart >= 0) {
			this.#sink?.text(this.#textStart, this.#textEnd, this.#textColor, this.#textBold);
		}
		this.#textStart = -1;
	}

	#flushBackground(end: number): void {
		if (end > this.#bgStart && this.#bgColor !== DEFAULT_BG) {
			this.#sink?.background(this.#bgStart, end, this.#bgColor);
		}
	}
}
