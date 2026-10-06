import { Terminal } from "@xterm/headless/lib-headless/xterm-headless.mjs";
import { describe, expect, it } from "vitest";
import { DEFAULT_FG } from "./colors";
import { RowScanner, type RunSink } from "./runs";

interface Runs {
	readonly backgrounds: Array<{ start: number; end: number; color: number }>;
	readonly texts: Array<{ start: number; end: number; color: number; bold: boolean; text: string }>;
}

async function scanFirstRow(ansi: string, scanCols = 20): Promise<Runs> {
	const term = new Terminal({ cols: 20, rows: 2, allowProposedApi: true });
	const { promise, resolve } = Promise.withResolvers<void>();
	term.write(ansi, resolve);
	await promise;
	const buffer = term.buffer.active;
	const line = buffer.getLine(0);
	if (!line) throw new Error("no line");
	const runs: Runs = { backgrounds: [], texts: [] };
	const sink: RunSink = {
		background: (start, end, color) => runs.backgrounds.push({ start, end, color }),
		text: (start, end, color, bold) =>
			runs.texts.push({ start, end, color, bold, text: line.translateToString(false, start, end) }),
	};
	new RowScanner(buffer.getNullCell()).scan(line, scanCols, sink);
	return runs;
}

describe("RowScanner", () => {
	it("emits one text run per same-style stretch, keeping inner blanks", async () => {
		const runs = await scanFirstRow("ab cd\x1b[31mef\x1b[0m  g");
		expect(runs.texts).toEqual([
			{ start: 0, end: 5, color: DEFAULT_FG, bold: false, text: "ab cd" },
			{ start: 5, end: 7, color: 0xcc0000, bold: false, text: "ef" },
			{ start: 9, end: 10, color: DEFAULT_FG, bold: false, text: "g" },
		]);
		expect(runs.backgrounds).toEqual([]);
	});

	it("splits text runs on weight changes", async () => {
		const runs = await scanFirstRow("a\x1b[1mb\x1b[22mc");
		expect(runs.texts.map((run) => [run.text, run.bold])).toEqual([
			["a", false],
			["b", true],
			["c", false],
		]);
	});

	it("emits non-default backgrounds as runs independent of text runs", async () => {
		const runs = await scanFirstRow("x\x1b[44m  y \x1b[42mz\x1b[0m");
		expect(runs.backgrounds).toEqual([
			{ start: 1, end: 5, color: 0x3465a4 },
			{ start: 5, end: 6, color: 0x4e9a06 },
		]);
		// Backgrounds are painted first, so same-fg text spans them as one run.
		expect(runs.texts.map((run) => run.text)).toEqual(["x  y z"]);
	});

	it("isolates double-width glyphs so following cells stay on the grid", async () => {
		const runs = await scanFirstRow("a漢b");
		expect(runs.texts.map((run) => [run.start, run.end, run.text])).toEqual([
			[0, 1, "a"],
			[1, 3, "漢"],
			[3, 4, "b"],
		]);
	});

	it("stops at the requested column count", async () => {
		const runs = await scanFirstRow("\x1b[41mabcdefgh", 4);
		expect(runs.backgrounds).toEqual([{ start: 0, end: 4, color: 0xcc0000 }]);
		expect(runs.texts.map((run) => run.text)).toEqual(["abcd"]);
	});
});
