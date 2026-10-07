import { POOL_TABLE } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { TABLE_OUTER } from "./table-space";
import { outerRect, pxToTable, tableToPx } from "./table-view";

const cloth = { left: 300, top: 200, width: 896, height: 448 };

describe("cloth rect ↔ table metres", () => {
	it("puts the cloth centre mid-rect, table +x to the right and +y up", () => {
		expect(tableToPx(cloth, { x: 0, y: 0 })).toEqual({ x: 748, y: 424 });
		const headTop = tableToPx(cloth, { x: -POOL_TABLE.length / 2, y: POOL_TABLE.width / 2 });
		expect(headTop.x).toBeCloseTo(cloth.left);
		expect(headTop.y).toBeCloseTo(cloth.top);
		const footBottom = tableToPx(cloth, { x: POOL_TABLE.length / 2, y: -POOL_TABLE.width / 2 });
		expect(footBottom.x).toBeCloseTo(cloth.left + cloth.width);
		expect(footBottom.y).toBeCloseTo(cloth.top + cloth.height);
	});

	it("round-trips pixels and table points", () => {
		const point = { x: 0.73, y: -0.21 };
		const back = pxToTable(cloth, tableToPx(cloth, point));
		expect(back.x).toBeCloseTo(point.x);
		expect(back.y).toBeCloseTo(point.y);
		const px = pxToTable(cloth, { x: 300, y: 648 });
		expect(px.x).toBeCloseTo(-POOL_TABLE.length / 2);
		expect(px.y).toBeCloseTo(-POOL_TABLE.width / 2);
	});

	it("grows the cloth rect by the rim on every side, keeping the centre", () => {
		const rim = outerRect(cloth);
		const scale = cloth.width / POOL_TABLE.length;
		expect(rim.width).toBeCloseTo(2 * TABLE_OUTER.x * scale);
		expect(rim.height).toBeCloseTo(2 * TABLE_OUTER.y * scale);
		expect(rim.left + rim.width / 2).toBeCloseTo(cloth.left + cloth.width / 2);
		expect(rim.top + rim.height / 2).toBeCloseTo(cloth.top + cloth.height / 2);
		expect(cloth.left - rim.left).toBeCloseTo(rim.top + rim.height - (cloth.top + cloth.height));
	});
});
