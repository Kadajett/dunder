import type { Layout, Vec2 } from "@shared/layout/schema";
import { DEG, type Placement } from "../scene/station";
import { cellCenter, isBlocked, type NavGrid } from "./nav-grid";
import { ROOM_CENTER, workoutSpots } from "./workout-spots";

/** Nobody stands closer to the board than this (metres along its facing). */
const MIN_REACH = 0.9;
/** Where the group centres, in front of the board. */
const STAND_OFF = 2.4;
/** Space between two people in the huddle. */
const SHOULDER_GAP = 1.05;

/**
 * Up to `count` spots for a brainstorm: free floor in front of the office
 * whiteboard, closest to the board first, everyone turned toward it. Without a
 * whiteboard in the layout, the group gathers in the middle of the room.
 */
export function meetingSpots(grid: NavGrid, layout: Layout, count: number): Placement[] {
	const board = layout.decor.find((item) => item.kind === "whiteboard");
	if (!board) return workoutSpots(grid, ROOM_CENTER, count);
	const facing = { x: Math.sin(board.rotation * DEG), z: Math.cos(board.rotation * DEG) };
	const along = (p: Vec2): number =>
		(p.x - board.position.x) * facing.x + (p.z - board.position.z) * facing.z;
	const anchor = {
		x: board.position.x + facing.x * STAND_OFF,
		z: board.position.z + facing.z * STAND_OFF,
	};
	const free: Vec2[] = [];
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			const point = cellCenter(grid, col, row);
			if (!isBlocked(grid, col, row) && along(point) >= MIN_REACH) free.push(point);
		}
	}
	const from = (p: Vec2): number => Math.hypot(p.x - anchor.x, p.z - anchor.z);
	free.sort((p, q) => from(p) - from(q));
	const chosen: Vec2[] = [];
	for (const point of free) {
		if (chosen.length >= count) break;
		const spaced = chosen.every(
			(other) => Math.hypot(other.x - point.x, other.z - point.z) >= SHOULDER_GAP,
		);
		if (spaced) chosen.push(point);
	}
	return chosen.map((position) => ({
		position,
		rotationY: Math.atan2(board.position.x - position.x, board.position.z - position.z),
	}));
}
