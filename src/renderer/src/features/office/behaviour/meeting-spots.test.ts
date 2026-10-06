import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { describe, expect, it } from "vitest";
import { meetingSpots } from "./meeting-spots";
import { buildNavGrid, cellOf, isBlocked } from "./nav-grid";
import { findPath } from "./pathfind";

const grid = buildNavGrid(DEFAULT_LAYOUT);
const board = DEFAULT_LAYOUT.decor.find((item) => item.kind === "whiteboard");

describe("meeting spots", () => {
	it("huddles everyone on reachable floor in front of the whiteboard, facing it", () => {
		if (!board) throw new Error("the default layout has a whiteboard");
		const spots = meetingSpots(grid, DEFAULT_LAYOUT, 8);
		expect(spots).toHaveLength(8);
		for (const { position, rotationY } of spots) {
			const [col, row] = cellOf(grid, position);
			expect(isBlocked(grid, col, row)).toBe(false);
			expect(findPath(grid, { x: 0, z: 0 }, position)).toBeDefined();
			// In front of the board (it faces +x on the left wall), within a few steps of it.
			expect(position.x).toBeGreaterThan(board.position.x + 0.8);
			expect(Math.hypot(position.x - board.position.x, position.z - board.position.z)).toBeLessThan(
				6,
			);
			// Turned toward the board: their forward (+z rotated) points at it.
			const toBoard = Math.atan2(board.position.x - position.x, board.position.z - position.z);
			expect(rotationY).toBeCloseTo(toBoard);
		}
		for (const [i, a] of spots.entries()) {
			for (const b of spots.slice(i + 1))
				expect(
					Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z),
				).toBeGreaterThanOrEqual(1);
		}
	});

	it("gathers in the middle of the room when there is no whiteboard", () => {
		const layout = {
			...DEFAULT_LAYOUT,
			decor: DEFAULT_LAYOUT.decor.filter((item) => item.kind !== "whiteboard"),
		};
		const spots = meetingSpots(buildNavGrid(layout), layout, 3);
		expect(spots).toHaveLength(3);
		for (const { position } of spots) expect(Math.hypot(position.x, position.z)).toBeLessThan(6);
	});
});
