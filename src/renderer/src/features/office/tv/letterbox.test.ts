import { describe, expect, it } from "vitest";
import { letterbox } from "./letterbox";

const WIDE = 16 / 9;

describe("letterbox", () => {
	it("fills the width and bars top and bottom in a tall window", () => {
		expect(letterbox(1600, 1600, WIDE)).toEqual({ left: 0, top: 350, width: 1600, height: 900 });
	});

	it("fills the height and bars left and right in a wide window", () => {
		expect(letterbox(3000, 900, WIDE)).toEqual({ left: 700, top: 0, width: 1600, height: 900 });
	});

	it("keeps the padding clear on the tight side", () => {
		const box = letterbox(1328, 2000, WIDE, 24);
		expect(box.left).toBe(24);
		expect(box.width).toBe(1280);
		expect(box.height).toBe(720);
	});

	it("collapses to nothing instead of going negative when the padding eats the window", () => {
		expect(letterbox(30, 30, WIDE, 20)).toEqual({ left: 15, top: 15, width: 0, height: 0 });
	});
});
