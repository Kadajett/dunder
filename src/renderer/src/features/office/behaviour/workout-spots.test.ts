import { DEFAULT_LAYOUT } from "@shared/layout/default-layout";
import { describe, expect, it } from "vitest";
import { buildNavGrid, cellOf, isBlocked } from "./nav-grid";
import { findPath } from "./pathfind";
import { across, FACE_CAMERA, ROOM_CENTER, ROW_GAP, workoutSpots } from "./workout-spots";

const grid = buildNavGrid(DEFAULT_LAYOUT);
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
	Math.hypot(a.x - b.x, a.z - b.z);

describe("workout spots", () => {
	it("finds open floor for everyone in the middle of the room, facing the camera", () => {
		const spots = workoutSpots(grid, ROOM_CENTER, 8);
		expect(spots).toHaveLength(8);
		for (const { position, rotationY } of spots) {
			const [col, row] = cellOf(grid, position);
			expect(isBlocked(grid, col, row)).toBe(false);
			expect(distance(position, ROOM_CENTER)).toBeLessThan(10);
			expect(rotationY).toBe(FACE_CAMERA);
		}
		for (const [i, a] of spots.entries()) {
			for (const b of spots.slice(i + 1))
				expect(distance(a.position, b.position)).toBeGreaterThan(1.6);
		}
	});

	it("lines a small group up side by side, so nobody hides behind anyone", () => {
		const row = workoutSpots(grid, ROOM_CENTER, 4)
			.map((spot) => across(spot.position))
			.sort((a, b) => a - b);
		for (let i = 1; i < row.length; i++) {
			expect((row[i] ?? 0) - (row[i - 1] ?? 0)).toBeGreaterThanOrEqual(ROW_GAP - 1e-9);
		}
	});

	it("is reachable from the desks", () => {
		const desk = DEFAULT_LAYOUT.desks[0];
		const spot = workoutSpots(grid, ROOM_CENTER, 1)[0];
		if (!desk || !spot) throw new Error("layout has no desks");
		expect(findPath(grid, desk.position, spot.position)).toBeDefined();
	});
});
