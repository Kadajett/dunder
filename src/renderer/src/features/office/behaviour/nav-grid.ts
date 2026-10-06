import type { DecorKind, Layout, Vec2 } from "@shared/layout/schema";
import { STATION_SCALE } from "../scene/station";

/** Floor footprint (width × depth, before rotation) that people walk around. */
const DECOR_FOOTPRINT: Record<DecorKind, readonly [number, number]> = {
	plant: [0.6, 0.6],
	"tall-plant": [0.7, 0.7],
	bookshelf: [2.0, 0.5],
	sofa: [2.0, 0.95],
	armchair: [1.0, 0.9],
	"coffee-table": [1.0, 0.6],
	"reception-desk": [2.6, 0.9],
	"server-rack": [0.7, 0.7],
	"floor-lamp": [0.4, 0.4],
	"mail-cubby": [1.3, 0.5],
	"notice-board": [0.6, 0.3],
	"water-cooler": [0.45, 0.45],
	printer: [0.7, 0.6],
	"wall-bell": [0, 0],
	"wall-clock": [0, 0],
	"wall-tv": [0, 0],
	"wall-placard": [0, 0],
};

/** Desk body footprint in desk-local space (the chair area stays walkable). */
const DESK_FOOTPRINT = { width: 1.5 * STATION_SCALE, depth: 0.82 * STATION_SCALE } as const;

const CELL = 0.4;
/** Keep walkers this far from furniture edges and walls. */
const CLEARANCE = 0.3;

export interface NavGrid {
	readonly cols: number;
	readonly rows: number;
	readonly originX: number;
	readonly originZ: number;
	/** 1 = blocked, row-major (row = z). */
	readonly blocked: Uint8Array;
}

interface Obstacle {
	readonly center: Vec2;
	readonly rotationDeg: number;
	readonly width: number;
	readonly depth: number;
}

function obstacles(layout: Layout): Obstacle[] {
	const desks = layout.desks.map((desk) => ({
		center: desk.position,
		rotationDeg: desk.rotation,
		width: DESK_FOOTPRINT.width,
		depth: DESK_FOOTPRINT.depth,
	}));
	const decor = layout.decor.flatMap((item) => {
		const [width, depth] = DECOR_FOOTPRINT[item.kind];
		if (width === 0 || item.elevation > 0) return [];
		return [{ center: item.position, rotationDeg: item.rotation, width, depth }];
	});
	return [...desks, ...decor];
}

function covers(obstacle: Obstacle, point: Vec2): boolean {
	const angle = (-obstacle.rotationDeg * Math.PI) / 180;
	const dx = point.x - obstacle.center.x;
	const dz = point.z - obstacle.center.z;
	const localX = dx * Math.cos(angle) + dz * Math.sin(angle);
	const localZ = -dx * Math.sin(angle) + dz * Math.cos(angle);
	return (
		Math.abs(localX) <= obstacle.width / 2 + CLEARANCE &&
		Math.abs(localZ) <= obstacle.depth / 2 + CLEARANCE
	);
}

export function cellCenter(grid: NavGrid, col: number, row: number): Vec2 {
	return { x: grid.originX + (col + 0.5) * CELL, z: grid.originZ + (row + 0.5) * CELL };
}

export function cellOf(grid: NavGrid, point: Vec2): readonly [number, number] {
	const col = Math.min(grid.cols - 1, Math.max(0, Math.floor((point.x - grid.originX) / CELL)));
	const row = Math.min(grid.rows - 1, Math.max(0, Math.floor((point.z - grid.originZ) / CELL)));
	return [col, row];
}

export function isBlocked(grid: NavGrid, col: number, row: number): boolean {
	if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return true;
	return grid.blocked[row * grid.cols + col] === 1;
}

/** Rasterise the room into walkable / blocked cells. */
export function buildNavGrid(layout: Layout): NavGrid {
	const { width, depth } = layout.room;
	const cols = Math.floor(width / CELL);
	const rows = Math.floor(depth / CELL);
	const grid = {
		cols,
		rows,
		originX: -width / 2,
		originZ: -depth / 2,
		blocked: new Uint8Array(cols * rows),
	};
	const items = obstacles(layout);
	for (let row = 0; row < rows; row += 1) {
		for (let col = 0; col < cols; col += 1) {
			const center = cellCenter(grid, col, row);
			const nearEdge = col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
			if (nearEdge || items.some((item) => covers(item, center)))
				grid.blocked[row * cols + col] = 1;
		}
	}
	return grid;
}
