import type { AppError } from "@shared/app-errors";
import { describe, expect, it } from "vitest";
import { consoleErrorWorthKeeping, ERRORS_KEPT, recordError } from "./error-log";

describe("the renderer error log", () => {
	it("counts a repeat of the same error in the same place, moving it to the front", () => {
		let log = recordError([], { message: "boom\nat x", where: "window", stack: "s1" }, 1).log;
		log = recordError(log, { message: "other", where: "window" }, 2).log;
		const repeat = recordError(log, { message: "boom\nat y", where: "window" }, 3);
		expect(repeat.fresh).toBe(false);
		expect(repeat.log.map((error) => [error.message.split("\n")[0], error.count])).toEqual([
			["boom", 2],
			["other", 1],
		]);
		expect(repeat.log[0]).toMatchObject({ firstAt: 1, lastAt: 3, stack: "s1" });
	});

	it("groups font failures that differ only in URL hashes and subset numbers", () => {
		let log: readonly AppError[] = [];
		for (let index = 1; index <= 50; index += 1) {
			const hash = index.toString(16).padStart(32, "0");
			log = recordError(
				log,
				{
					message: `Loading the font https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/Xiaolai/Xiaolai-Regular-${hash}.woff2 subset ${index} violates font-src`,
					where: "console",
				},
				index,
			).log;
		}
		expect(log).toHaveLength(1);
		expect(log[0]?.count).toBe(50);
	});

	it("excludes third-party console sources but retains app-source and uncaught errors", () => {
		expect(
			consoleErrorWorthKeeping(
				"error",
				"Loading font failed",
				"https://esm.sh/@excalidraw/excalidraw/dist/prod/fonts/Xiaolai/font.woff2",
			),
		).toBe(false);
		expect(
			consoleErrorWorthKeeping(
				"error",
				"TypeError",
				"file:///app/node_modules/@excalidraw/excalidraw/index.js",
			),
		).toBe(false);
		expect(consoleErrorWorthKeeping("error", "app failure", "file:///app/out/app.js")).toBe(true);
	});

	it("keeps the same message from different places apart", () => {
		let log = recordError([], { message: "boom", where: "window" }, 1).log;
		const elsewhere = recordError(log, { message: "boom", where: "boundary:whiteboard" }, 2);
		log = elsewhere.log;
		expect(elsewhere.fresh).toBe(true);
		expect(log).toHaveLength(2);
	});

	it(`keeps only the latest ${ERRORS_KEPT} distinct errors`, () => {
		let log = recordError([], { message: "first", where: "console" }, 0).log;
		for (let i = 1; i <= ERRORS_KEPT; i += 1)
			log = recordError(log, { message: `e${i}`, where: "console" }, i).log;
		expect(log).toHaveLength(ERRORS_KEPT);
		expect(log[0]?.message).toBe(`e${ERRORS_KEPT}`);
		expect(log.some((error) => error.message === "first")).toBe(false);
	});

	it("takes console errors, but not the 'Uncaught' echo of errors the page reports itself", () => {
		expect(consoleErrorWorthKeeping("error", "tldraw: missing licence key")).toBe(true);
		expect(consoleErrorWorthKeeping("error", "Uncaught TypeError: x is undefined")).toBe(false);
		expect(consoleErrorWorthKeeping("warning", "deprecated")).toBe(false);
	});
});
