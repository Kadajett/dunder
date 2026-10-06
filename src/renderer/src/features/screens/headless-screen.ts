import type { ScreenChunk } from "@shared/screens";
import type { IBuffer } from "@xterm/headless";
import { Terminal } from "@xterm/headless/lib-headless/xterm-headless.mjs";

/**
 * One pane's screen as an `@xterm/headless` emulator fed by observe chunks.
 * herdr frames are full-screen renders with absolute cursor moves, so the emulator only
 * mirrors the visible screen (no scrollback). `onDirty` fires once each applied chunk
 * has been parsed.
 */
export class HeadlessScreen {
	#term: Terminal | null = null;
	#cols = 0;
	#rows = 0;
	readonly #onDirty: () => void;

	constructor(onDirty: () => void) {
		this.#onDirty = onDirty;
	}

	/** Size of the emulator once all queued writes are parsed. */
	get cols(): number {
		return this.#cols;
	}

	get rows(): number {
		return this.#rows;
	}

	/** The live buffer, or null before the first chunk. Its size may lag `cols`/`rows`. */
	get buffer(): IBuffer | null {
		return this.#term?.buffer.active ?? null;
	}

	apply(chunk: ScreenChunk): void {
		const term =
			chunk.reset || this.#term === null
				? this.#recreate(chunk.cols, chunk.rows)
				: this.#resizeInOrder(this.#term, chunk.cols, chunk.rows);
		term.write(chunk.data, () => this.#markDirty(term));
	}

	dispose(): void {
		this.#term?.dispose();
		this.#term = null;
	}

	/** A fresh attach repaints everything: drop the old emulator and any unparsed backlog. */
	#recreate(cols: number, rows: number): Terminal {
		this.#term?.dispose();
		const term = new Terminal({ cols, rows, scrollback: 0, allowProposedApi: true });
		this.#term = term;
		this.#cols = cols;
		this.#rows = rows;
		return term;
	}

	/** Resizes after already-queued bytes are parsed, so they land on the size they were drawn for. */
	#resizeInOrder(term: Terminal, cols: number, rows: number): Terminal {
		if (cols === this.#cols && rows === this.#rows) return term;
		this.#cols = cols;
		this.#rows = rows;
		term.write(new Uint8Array(0), () => {
			if (term === this.#term) term.resize(cols, rows);
		});
		return term;
	}

	#markDirty(term: Terminal): void {
		if (term === this.#term) this.#onDirty();
	}
}
