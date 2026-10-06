import type { WhiteboardSnapshot } from "@shared/whiteboard";
import { describe, expect, it } from "vitest";
import { boardShapes, fitView } from "./board-view";

/** A document with two pages; shapes are bare enough for placement (notes on either page). */
function documentWith(shapes: readonly { readonly id: string }[]): WhiteboardSnapshot {
	const pages = [
		{ id: "page:b", typeName: "page", index: "a2", name: "Later", meta: {} },
		{ id: "page:a", typeName: "page", index: "a1", name: "Page 1", meta: {} },
	];
	const store = Object.fromEntries([...pages, ...shapes].map((record) => [record.id, record]));
	// Test fixture: only the fields placement reads, not full tldraw records.
	return { store, schema: { schemaVersion: 2, sequences: {} } } as unknown as WhiteboardSnapshot;
}

const note = (id: string, index: string, parentId: string, x: number) => ({
	id,
	typeName: "shape",
	type: "note",
	index,
	parentId,
	x,
	y: 0,
	rotation: 0,
	props: { scale: 1, growY: 0 },
});

describe("boardShapes", () => {
	it("takes the first page's shapes, back to front by index", () => {
		const shapes = boardShapes(
			documentWith([
				note("shape:top", "a3", "page:a", 400),
				note("shape:elsewhere", "a1", "page:b", 0),
				note("shape:bottom", "a1", "page:a", 0),
			]),
		);
		expect(shapes.map((placed) => placed.shape.id)).toEqual(["shape:bottom", "shape:top"]);
		expect(boardShapes(null)).toEqual([]);
	});
});

describe("fitView", () => {
	it("centres a wide drawing and fits its width inside the margin", () => {
		const view = fitView([{ x: 0, y: 0, w: 4000, h: 1000 }], 1000, 500);
		expect(view.scale).toBeCloseTo(0.225);
		// The drawing's centre lands on the canvas centre.
		expect(2000 * view.scale + view.x).toBeCloseTo(500);
		expect(500 * view.scale + view.y).toBeCloseTo(250);
	});

	it("does not blow one small note up to fill the board", () => {
		const view = fitView([{ x: 0, y: 0, w: 200, h: 200 }], 1000, 500);
		// At most a fifth of the board's width, as if a few notes sat beside it.
		expect(200 * view.scale).toBeLessThanOrEqual(1000 / 5);
	});
});
