import { CUE_ARM_LEAN } from "./held-cue";
import { PHONE_ARM, PHONE_ARM_MIRRORED } from "./held-phone";
import {
	type ArmAngles,
	type MiiActivity,
	type MiiPose,
	type Rig,
	SEATED_ARMS,
	SEATED_LEAN,
	SEATED_SHIN_SCALE,
	SHIN,
} from "./rig";

/** Walk cycle angular speed (rad/s): about 1.2 strides per second. */
const WALK = 7.5;
const HALF_PI = Math.PI / 2;

/** Reused outputs so the frame loop never allocates. */
const arm: ArmAngles = { x: 0, z: 0 };
const leg = { hip: 0, knee: 0 };

/** Writes hip and knee angles of leg `i` into the shared `leg` scratch object. */
function legPose(pose: MiiPose, i: number, t: number): void {
	if (pose === "seated") {
		leg.hip = -HALF_PI;
		leg.knee = HALF_PI;
	} else if (pose === "walking") {
		const cycle = WALK * t + i * Math.PI;
		leg.hip = 0.5 * Math.sin(cycle);
		leg.knee = 0.8 * Math.max(0, -Math.cos(cycle));
	} else {
		leg.hip = 0;
		leg.knee = 0;
	}
}

function animateLegs(rig: Rig, pose: MiiPose, t: number): void {
	const shinScale = pose === "seated" ? SEATED_SHIN_SCALE : 1;
	for (let i = 0; i < 2; i++) {
		const thigh = rig.thighs[i]?.current;
		const knee = rig.knees[i]?.current;
		const shin = rig.shins[i]?.current;
		const foot = rig.feet[i]?.current;
		if (!thigh || !knee || !shin || !foot) continue;
		legPose(pose, i, t);
		thigh.rotation.set(leg.hip, 0, 0);
		knee.rotation.set(leg.knee, 0, 0);
		shin.scale.y = shinScale;
		foot.position.y = -SHIN * shinScale;
		// Keep soles parallel to the floor.
		foot.rotation.set(-(leg.hip + leg.knee), 0, 0);
	}
}

/** A stretch every few seconds: arms rise overhead, hold, and come down. */
const STRETCH = { period: 7, rise: 0.8, hold: 2.2 } as const;
/** Arms overhead in a stretch: up and a little out from the shoulder. */
const ARMS_UP = Math.PI - 0.35;
/** How far a slumped agent sags forward past the usual seated lean, and drops its head. */
const SLUMP = { lean: 0.28, head: 0.42 } as const;

/** 0 at rest, 1 with the arms fully up, eased at both ends. */
function stretchAmount(t: number): number {
	const { period, rise, hold } = STRETCH;
	const p = ((t % period) + period) % period;
	let up = 0;
	if (p < rise) up = p / rise;
	else if (p < rise + hold) up = 1;
	else if (p < 2 * rise + hold) up = 1 - (p - rise - hold) / rise;
	return up * up * (3 - 2 * up);
}

const lerp = (from: number, to: number, k: number): number => from + (to - from) * k;

/** Reused output for the head's Euler angles. */
const look = { x: 0, y: 0, z: 0 };

/** Writes the head's angles for `activity` into `look`. */
function headPose(activity: MiiActivity, walking: boolean, t: number): void {
	const typing = activity === "typing" && !walking;
	look.x = typing ? 0.06 + 0.035 * Math.sin(t * 9) : 0.03 * Math.sin(t * 0.9);
	look.y = typing ? 0.05 * Math.sin(t * 0.7) : 0.32 * Math.sin(t * 0.5);
	look.z = 0;
	if (activity === "slumped") {
		look.x = SLUMP.head + 0.03 * Math.sin(t * 0.8);
		look.y = 0;
		look.z = 0.08;
	} else if (activity === "stretching") {
		const s = stretchAmount(t);
		look.x = lerp(look.x, -0.3, s);
		look.y *= 1 - s;
	} else if (activity === "phone") {
		// Square to the handset, so the head never swings through it.
		look.y = 0;
	}
}

function animateUpper(rig: Rig, pose: MiiPose, activity: MiiActivity, t: number): void {
	const root = rig.root.current;
	const upper = rig.upper.current;
	const head = rig.head.current;
	if (!root || !upper || !head) return;
	const walking = pose === "walking";
	const lean = pose === "seated" ? SEATED_LEAN : walking ? 0.06 : 0;
	root.position.y = walking ? 0.025 * Math.abs(Math.sin(WALK * t)) : 0;
	upper.rotation.x = lean;
	upper.rotation.y = walking ? 0.06 * Math.sin(WALK * t) : 0;
	upper.scale.y = 1 + 0.012 * Math.sin(t * 2.2);
	if (activity === "slumped") {
		upper.rotation.x = lean + SLUMP.lean;
		upper.scale.y = 0.97 + 0.008 * Math.sin(t * 1.2);
	} else if (activity === "stretching") {
		upper.rotation.x = lerp(lean, -0.2, stretchAmount(t));
	}
	headPose(activity, walking, t);
	head.rotation.set(look.x, look.y, look.z);
}

/** Writes the at-rest angles of arm `i` (0 = +x side) for `pose` into `arm`. */
function restingArm(pose: MiiPose, activity: MiiActivity, i: number, t: number): void {
	const side = i === 0 ? 1 : -1;
	if (pose === "seated") {
		const rest = SEATED_ARMS[i === 0 ? 0 : 1];
		const tap = activity === "typing" ? 0.09 * Math.max(0, Math.sin(t * 14 + i * 2.2)) : 0;
		arm.x = rest.x - tap;
		arm.z = rest.z;
	} else if (activity === "cue" && i === 0) {
		// Hand out in front, gripping the cue that stands on the floor.
		arm.x = -CUE_ARM_LEAN + 0.03 * Math.sin(t * 1.3);
		arm.z = 0.16;
	} else if (pose === "walking") {
		arm.x = -0.45 * Math.sin(WALK * t + i * Math.PI);
		arm.z = side * 0.1;
	} else {
		arm.x = 0.04 * Math.sin(t * 1.1 + i);
		arm.z = side * (0.1 + 0.02 * Math.sin(t * 2.2));
	}
}

/** Phone arm angles, indexed like the rig: 0 = +x arm, 1 = -x arm. */
const PHONE_ARMS: readonly [ArmAngles, ArmAngles] = [PHONE_ARM, PHONE_ARM_MIRRORED];

/**
 * Writes the angles of arm `i` (0 = +x side) into the shared `arm` scratch
 * object. On the phone, arm `phoneHand` holds the handset to the ear.
 */
function armPose({ pose, activity, phoneHand }: RigMotion, i: number, t: number): void {
	const side = i === 0 ? 1 : -1;
	if (activity === "phone" && i === phoneHand) {
		arm.x = PHONE_ARMS[i].x;
		arm.z = PHONE_ARMS[i].z;
		return;
	}
	if (activity === "slumped") {
		// Hands dropped into the lap, a little apart.
		arm.x = pose === "seated" ? -0.55 : 0;
		arm.z = side * 0.12;
		return;
	}
	restingArm(pose, activity, i, t);
	if (activity !== "stretching") return;
	const s = stretchAmount(t);
	arm.x = lerp(arm.x, 0, s);
	arm.z = lerp(arm.z, side * ARMS_UP, s);
}

/** What the rig is doing: the pose, the activity on top, and (on the phone) which arm holds the handset. */
export interface RigMotion {
	readonly pose: MiiPose;
	readonly activity: MiiActivity;
	readonly phoneHand: 0 | 1;
}

/**
 * Poses every joint for time `t` (seconds, already offset by the character's
 * phase). The `exercising` pose is driven by `animateExercise` instead.
 */
export function animateRig(rig: Rig, motion: RigMotion, t: number): void {
	animateLegs(rig, motion.pose, t);
	animateUpper(rig, motion.pose, motion.activity, t);
	for (let i = 0; i < 2; i++) {
		const group = rig.arms[i]?.current;
		if (!group) continue;
		armPose(motion, i, t);
		group.rotation.set(arm.x, 0, arm.z);
	}
}
