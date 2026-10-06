import type { Desk, Vec2 } from "@shared/layout/schema";

/** Workstations and people are modelled at 1:1 and drawn this much larger to read well from afar. */
export const STATION_SCALE = 1.25;

/** Seat position in (unscaled) desk-local space: the occupant sits on +z, facing the screen. */
export const SEAT_Z = 0.8;

export const DEG = Math.PI / 180;

export interface Placement {
	readonly position: Vec2;
	/** Radians around +y; 0 faces +z. */
	readonly rotationY: number;
}

/** Rotate a desk-local offset into world space. */
export function deskToWorld(desk: Desk, local: Vec2): Vec2 {
	const angle = desk.rotation * DEG;
	const x = local.x * STATION_SCALE;
	const z = local.z * STATION_SCALE;
	return {
		x: desk.position.x + x * Math.cos(angle) + z * Math.sin(angle),
		z: desk.position.z - x * Math.sin(angle) + z * Math.cos(angle),
	};
}

/** Where a seated agent's root sits, facing the monitor. */
export function seatPlacement(desk: Desk): Placement {
	return {
		position: deskToWorld(desk, { x: 0, z: SEAT_Z }),
		rotationY: desk.rotation * DEG + Math.PI,
	};
}

/** A spot beside the desk where a colleague stands to talk. */
export function visitorPlacement(desk: Desk): Placement {
	const position = deskToWorld(desk, { x: 1.05, z: SEAT_Z });
	return { position, rotationY: desk.rotation * DEG - Math.PI / 2 };
}
