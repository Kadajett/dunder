import type { IBufferCell } from "@xterm/headless";
import { Terminal } from "@xterm/headless/lib-headless/xterm-headless.mjs";
import { describe, expect, it } from "vitest";
import { CellStyle, cssColor, DEFAULT_BG, DEFAULT_FG, PALETTE_256 } from "./colors";

async function firstCell(ansi: string): Promise<IBufferCell> {
	const term = new Terminal({ cols: 10, rows: 2, allowProposedApi: true });
	const { promise, resolve } = Promise.withResolvers<void>();
	term.write(`${ansi}X`, resolve);
	await promise;
	const cell = term.buffer.active.getLine(0)?.getCell(0);
	if (!cell) throw new Error("no cell");
	return cell;
}

async function styleOf(ansi: string): Promise<CellStyle> {
	const style = new CellStyle();
	style.resolve(await firstCell(ansi));
	return style;
}

describe("PALETTE_256", () => {
	it("follows the xterm cube and grey ramp", () => {
		expect(PALETTE_256[1]).toBe(0xcc0000);
		expect(PALETTE_256[16]).toBe(0x000000);
		expect(PALETTE_256[196]).toBe(0xff0000);
		expect(PALETTE_256[67]).toBe(0x5f87af);
		expect(PALETTE_256[231]).toBe(0xffffff);
		expect(PALETTE_256[232]).toBe(0x080808);
		expect(PALETTE_256[255]).toBe(0xeeeeee);
	});
});

describe("CellStyle.resolve", () => {
	it("uses theme defaults for unstyled cells", async () => {
		expect(await styleOf("")).toMatchObject({ fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false });
	});

	it("decodes 16-colour, 256-colour and truecolor fg/bg", async () => {
		expect(await styleOf("\x1b[31;44m")).toMatchObject({ fg: 0xcc0000, bg: 0x3465a4 });
		expect(await styleOf("\x1b[38;5;196;48;5;232m")).toMatchObject({ fg: 0xff0000, bg: 0x080808 });
		expect(await styleOf("\x1b[38;2;1;2;3;48;2;250;128;0m")).toMatchObject({
			fg: 0x010203,
			bg: 0xfa8000,
		});
	});

	it("brightens bold low ANSI colours but not 256/truecolor ones", async () => {
		expect(await styleOf("\x1b[1;31m")).toMatchObject({ fg: 0xef2929, bold: true });
		expect(await styleOf("\x1b[1;38;5;196m")).toMatchObject({ fg: 0xff0000, bold: true });
	});

	it("swaps colours for inverse, including defaults", async () => {
		expect(await styleOf("\x1b[7m")).toMatchObject({ fg: DEFAULT_BG, bg: DEFAULT_FG });
		expect(await styleOf("\x1b[7;31;42m")).toMatchObject({ fg: 0x4e9a06, bg: 0xcc0000 });
	});

	it("dims toward the background and hides invisible text", async () => {
		expect(await styleOf("\x1b[2;38;2;200;100;0;48;2;0;0;0m")).toMatchObject({ fg: 0x643200 });
		expect(await styleOf("\x1b[8;31;44m")).toMatchObject({ fg: 0x3465a4, bg: 0x3465a4 });
	});
});

describe("cssColor", () => {
	it("formats packed colours as zero-padded hex", () => {
		expect(cssColor(0x0000ff)).toBe("#0000ff");
		expect(cssColor(0xfa8000)).toBe("#fa8000");
	});
});
