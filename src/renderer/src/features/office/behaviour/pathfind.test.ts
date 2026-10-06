import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { type Layout, layoutSchema } from "@shared/layout/schema";
import { describe, expect, it } from "vitest";
import { seatPlacement } from "../scene/station";
import { buildNavGrid, cellOf, isBlocked } from "./nav-grid";
import { findPath } from "./pathfind";

const room = {
	width: 10,
	depth: 10,
	wallHeight: 3,
	floorColor: "#000",
	wallColor: "#fff",
	windows: [],
	sign: { title: "T", subtitle: "S", offset: 1 },
};

/** A 10×10 room with a long bookshelf wall across the middle, open at the +x end. */
const walled: Layout = layoutSchema.parse({
	version: 1,
	room,
	zones: [],
	desks: [],
	decor: [-4.5, -3, -1, 1].map((x, i) => ({
		id: `shelf-${i}`,
		kind: "bookshelf",
		position: { x, z: 0 },
	})),
	callouts: [],
});

describe("findPath", () => {
	it("routes around obstacles without crossing blocked cells", () => {
		const grid = buildNavGrid(walled);
		const path = findPath(grid, { x: -2, z: -3 }, { x: -2, z: 3 });
		expect(path).toBeDefined();
		const points = path ?? [];
		// The detour must pass the open end of the shelf wall.
		expect(Math.max(...points.map((p) => p.x))).toBeGreaterThan(2);
		for (let i = 1; i < points.length - 2; i += 1) {
			const a = points[i];
			const b = points[i + 1];
			if (!a || !b) continue;
			for (let t = 0; t <= 1; t += 0.05) {
				const [col, row] = cellOf(grid, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
				expect(isBlocked(grid, col, row)).toBe(false);
			}
		}
	});

	it("keeps the exact start and goal so walkers leave and reach their chair", () => {
		const grid = buildNavGrid(walled);
		const path = findPath(grid, { x: -2.1, z: -3.3 }, { x: 3.7, z: 3.2 });
		expect(path?.[0]).toEqual({ x: -2.1, z: -3.3 });
		expect(path?.at(-1)).toEqual({ x: 3.7, z: 3.2 });
	});

	it("connects every desk seat in the default office to the break room", () => {
		const grid = buildNavGrid(DEFAULT_LAYOUT);
		const breakRoom = { x: -10.4, z: 4.6 };
		for (const desk of DEFAULT_LAYOUT.desks) {
			expect(findPath(grid, seatPlacement(desk).position, breakRoom), desk.id).toBeDefined();
		}
	});
});
