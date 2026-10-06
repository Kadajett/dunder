import { describe, expect, it } from "vitest";
import { fitView } from "./board-view";

describe("fitView", () => {
	it("centres a wide drawing and fits its width inside the margin", () => {
		const view = fitView({ x: 0, y: 0, w: 4000, h: 1000 }, 1000, 500);
		expect(view.scale).toBeCloseTo(0.225);
		// The drawing's centre lands on the canvas centre.
		expect(2000 * view.scale + view.x).toBeCloseTo(500);
		expect(500 * view.scale + view.y).toBeCloseTo(250);
	});

	it("does not blow one small note up to fill the board", () => {
		const view = fitView({ x: 0, y: 0, w: 200, h: 200 }, 1000, 500);
		// At most a fifth of the board's width, as if a few notes sat beside it.
		expect(200 * view.scale).toBeLessThanOrEqual(1000 / 5);
	});
});
