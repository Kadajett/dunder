import { createRef, type RefObject } from "react";
import type { Group } from "three";

/** `exercising` follows the group workout routine (see `exercise.ts`) instead of the clock. */
export type MiiPose = "seated" | "standing" | "walking" | "exercising";
export type MiiActivity = "typing" | "idle" | "waving";

/* Body dimensions (metres). Hips are the rig root; everything above hangs off them. */
export const HIP_Y = 0.48;
export const HIP_X = 0.095;
export const THIGH = 0.21;
export const SHIN = 0.2;
/** Leg block cross-section; two legs side by side fill the torso's width. */
export const LEG_WIDTH = 0.15;
/** Torso block, centred `y` above the hips (upper-body local). */
export const TORSO = { y: 0.22, width: 0.38, height: 0.4, depth: 0.24 } as const;
export const NECK_Y = 0.445;
/** Head block, centred `y` above the hips: a big cube that reads from the isometric camera. */
export const HEAD = { y: 0.66, width: 0.44, height: 0.4, depth: 0.4 } as const;
export const ARM_WIDTH = 0.11;
export const SHOULDER_X = TORSO.width / 2 + ARM_WIDTH / 2 + 0.005;
export const SHOULDER_Y = 0.37;
/** Shoulder pivot to hand centre. */
export const ARM_REACH = 0.4;
/**
 * How far cloth (and anything worn) stands proud of what it covers, on every
 * side and at every end it doesn't stop short of: depth-buffer room so two
 * colours never share a plane. `parts.test.ts` holds every rigid part to it.
 */
export const CLOTH_GAP = 0.006;

/** Forward lean of the upper body while seated at a desk. */
export const SEATED_LEAN = 0.15;
/** Seated shins stretch to reach the floor from a 0.46 m chair seat. */
export const SEATED_SHIN_SCALE = (HIP_Y - 0.07) / SHIN;

/** Where seated hands rest: a keyboard on the desk in front (hip-root space). */
const KEYBOARD = { x: 0.13, y: 0.78 - HIP_Y, z: 0.45 };

export interface ArmAngles {
	x: number;
	z: number;
}

/**
 * Euler XYZ angles that point a hanging (-y) arm from its shoulder at the
 * keyboard: Rz swings it sideways (x = sin z), then Rx swings it forward.
 */
function keyboardArm(side: 1 | -1): ArmAngles {
	const c = Math.cos(SEATED_LEAN);
	const s = Math.sin(SEATED_LEAN);
	// Target in the leaned upper-body frame, relative to the shoulder.
	const dx = side * (KEYBOARD.x - SHOULDER_X);
	const dy = KEYBOARD.y * c + KEYBOARD.z * s - SHOULDER_Y;
	const dz = -KEYBOARD.y * s + KEYBOARD.z * c;
	const length = Math.hypot(dx, dy, dz);
	return { x: Math.atan2(-dz, -dy), z: Math.asin(dx / length) };
}

/** Seated typing arm angles, indexed like the rig: 0 = +x arm, 1 = -x arm. */
export const SEATED_ARMS: readonly [ArmAngles, ArmAngles] = [keyboardArm(1), keyboardArm(-1)];

type GroupRef = RefObject<Group | null>;
type Pair = readonly [GroupRef, GroupRef];

/** Animated joints. Pairs are indexed 0 = +x side (the camera-facing side), 1 = -x side. */
export interface Rig {
	root: GroupRef;
	upper: GroupRef;
	head: GroupRef;
	arms: Pair;
	thighs: Pair;
	knees: Pair;
	shins: Pair;
	feet: Pair;
}

export function createRig(): Rig {
	const pair = (): Pair => [createRef<Group>(), createRef<Group>()];
	return {
		root: createRef<Group>(),
		upper: createRef<Group>(),
		head: createRef<Group>(),
		arms: pair(),
		thighs: pair(),
		knees: pair(),
		shins: pair(),
		feet: pair(),
	};
}
