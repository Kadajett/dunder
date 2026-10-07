import { POOL_TABLE } from "@shared/pool";
import type { ScreenRect } from "../office/focus/focus-store";
import { TABLE_OUTER, type TablePoint } from "./table-space";

/** A point in CSS pixels, in the same frame as the cloth rect (x right, y down). */
export interface PxPoint {
	readonly x: number;
	readonly y: number;
}

/**
 * The cloth rect is the settled top-down projection of the playing surface:
 * table +x runs right across its width, +y up its height, origin at its centre.
 */
export function tableToPx(cloth: ScreenRect, point: TablePoint): PxPoint {
	return {
		x: cloth.left + (point.x / POOL_TABLE.length + 0.5) * cloth.width,
		y: cloth.top + (0.5 - point.y / POOL_TABLE.width) * cloth.height,
	};
}

export function pxToTable(cloth: ScreenRect, px: PxPoint): TablePoint {
	return {
		x: ((px.x - cloth.left) / cloth.width - 0.5) * POOL_TABLE.length,
		y: (0.5 - (px.y - cloth.top) / cloth.height) * POOL_TABLE.width,
	};
}

/** The table's outer rim (cloth plus cushions and wooden rail) in the cloth rect's pixels. */
export function outerRect(cloth: ScreenRect): ScreenRect {
	const topLeft = tableToPx(cloth, { x: -TABLE_OUTER.x, y: TABLE_OUTER.y });
	const bottomRight = tableToPx(cloth, { x: TABLE_OUTER.x, y: -TABLE_OUTER.y });
	return {
		left: topLeft.x,
		top: topLeft.y,
		width: bottomRight.x - topLeft.x,
		height: bottomRight.y - topLeft.y,
	};
}
