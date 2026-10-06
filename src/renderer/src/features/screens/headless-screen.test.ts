import type { ScreenChunk } from "@shared/screens";
import { describe, expect, it } from "vitest";
import { HeadlessScreen } from "./headless-screen";

const chunk = (text: string, options: Partial<ScreenChunk> = {}): ScreenChunk => ({
	kind: "observe",
	id: "p1",
	reset: false,
	cols: 10,
	rows: 3,
	data: new TextEncoder().encode(text),
	...options,
});

/** A screen whose `parsed()` resolves at the next dirty signal. */
function create() {
	let signal = Promise.withResolvers<void>();
	const screen = new HeadlessScreen(() => {
		signal.resolve();
		signal = Promise.withResolvers<void>();
	});
	return { screen, parsed: () => signal.promise };
}

function rowText(screen: HeadlessScreen, row: number): string {
	return screen.buffer?.getLine(row)?.translateToString(true) ?? "";
}

describe("HeadlessScreen", () => {
	it("reports dirty once written bytes are parsed", async () => {
		const { screen, parsed } = create();
		const done = parsed();
		screen.apply(chunk("hello"));
		expect(rowText(screen, 0)).toBe("");
		await done;
		expect(rowText(screen, 0)).toBe("hello");
	});

	it("discards the previous screen on a reset chunk", async () => {
		const { screen, parsed } = create();
		screen.apply(chunk("old\r\nlines"));
		const done = parsed();
		screen.apply(chunk("new", { reset: true }));
		await done;
		expect(rowText(screen, 0)).toBe("new");
		expect(rowText(screen, 1)).toBe("");
	});

	it("follows the frame size, resizing after earlier bytes are parsed", async () => {
		const { screen, parsed } = create();
		screen.apply(chunk("0123456789"));
		await parsed();
		const done = parsed();
		screen.apply(chunk("\x1b[1;1Habcdefghijklmnopqrst", { cols: 20, rows: 4 }));
		expect([screen.cols, screen.rows]).toEqual([20, 4]);
		await done;
		expect(screen.buffer?.length).toBe(4);
		expect(rowText(screen, 0)).toBe("abcdefghijklmnopqrst");
	});
});
