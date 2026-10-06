import type { Desk, Vec2 } from "@shared/layout/schema";
import { VIEW_DIRECTION } from "../camera-fit";
import { type Placement, visitorPlacement } from "../scene/station";
import { cellCenter, isBlocked, type NavGrid } from "./nav-grid";

/** Heading (radians around +y, 0 = +z) that turns a body toward the isometric camera. */
export const FACE_CAMERA = Math.atan2(VIEW_DIRECTION.x, VIEW_DIRECTION.z);

/** Floor position across the screen (left → right) as seen from the camera. */
export const across = (p: Vec2): number =>
	p.x * Math.cos(FACE_CAMERA) - p.z * Math.sin(FACE_CAMERA);
/** Floor position toward the camera (back → front). */
const toward = (p: Vec2): number => p.x * Math.sin(FACE_CAMERA) + p.z * Math.cos(FACE_CAMERA);

/** Side-by-side gap between exercisers: arms spread wide (warrior, jacks) never touch. */
export const ROW_GAP = 1.7;
/** Distance between rows, so the back row is not hidden behind the front one. */
const ROW_DEPTH = 2.4;
/** Moving one row back costs as much as this many metres sideways. */
const DEPTH_COST = 3;
/** Free cells required around a spot in every direction (one cell = 0.4 m). */
const ELBOW_ROOM = 1;

/** The middle of the room: the central aisle of the open floor. */
export const ROOM_CENTER: Vec2 = { x: 0, z: 0 };

function roomy(grid: NavGrid, col: number, row: number): boolean {
	for (let dr = -ELBOW_ROOM; dr <= ELBOW_ROOM; dr++) {
		for (let dc = -ELBOW_ROOM; dc <= ELBOW_ROOM; dc++) {
			if (isBlocked(grid, col + dc, row + dr)) return false;
		}
	}
	return true;
}

/**
 * Up to `count` open-floor spots around `anchor`, lined up in rows across the
 * screen so the camera sees everyone, each with elbow room, all facing the camera.
 */
export function workoutSpots(grid: NavGrid, anchor: Vec2, count: number): Placement[] {
	const cost = (p: Vec2): number =>
		Math.abs(across(p) - across(anchor)) + DEPTH_COST * Math.abs(toward(p) - toward(anchor));
	const free: Vec2[] = [];
	for (let row = 0; row < grid.rows; row++) {
		for (let col = 0; col < grid.cols; col++) {
			if (roomy(grid, col, row)) free.push(cellCenter(grid, col, row));
		}
	}
	free.sort((p, q) => cost(p) - cost(q));
	const chosen: Vec2[] = [];
	const apart = (p: Vec2, q: Vec2): boolean =>
		Math.abs(across(p) - across(q)) >= ROW_GAP || Math.abs(toward(p) - toward(q)) >= ROW_DEPTH;
	for (const point of free) {
		if (chosen.length >= count) break;
		if (chosen.every((other) => apart(other, point))) chosen.push(point);
	}
	return chosen.map((position) => ({ position, rotationY: FACE_CAMERA }));
}

/** Fallback when the group spot is unreachable: beside the agent's own desk. */
export function besideDesk(desk: Desk): Placement {
	return { position: visitorPlacement(desk).position, rotationY: FACE_CAMERA };
}
