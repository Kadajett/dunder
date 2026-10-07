import type { Cuboid } from "./Block";
import { ARM_REACH } from "./rig";

/** The arm leans forward this much while holding the cue (see `armPose`); the cue leans back by it to stand upright. */
export const CUE_ARM_LEAN = 0.32;

/** A point `along` metres up the upright cue from the hand, in arm space. */
function alongCue(along: number): [number, number, number] {
	return [0, -ARM_REACH + along * Math.cos(CUE_ARM_LEAN), 0.06 + along * Math.sin(CUE_ARM_LEAN)];
}

const UPRIGHT: [number, number, number] = [CUE_ARM_LEAN, 0, 0];

/**
 * A pool cue held upright in the hand, butt near the floor and tip above the
 * head, in arm space (child of the arm group). Each part overlaps the shaft
 * and is wider than it, so no two colours share a face.
 */
export const HELD_CUE: readonly Cuboid[] = [
	{ color: "#d9b382", at: alongCue(0.155), size: [0.028, 1.1, 0.028], rotation: UPRIGHT },
	{ color: "#5a3a22", at: alongCue(-0.27), size: [0.042, 0.35, 0.042], rotation: UPRIGHT },
	{ color: "#f4f1e8", at: alongCue(0.705), size: [0.04, 0.03, 0.04], rotation: UPRIGHT },
];
