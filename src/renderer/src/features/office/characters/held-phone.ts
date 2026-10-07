import { Euler, Quaternion, Vector3 } from "three";
import type { Cuboid } from "./Block";
import { type ArmAngles, HEAD, SHOULDER_X, SHOULDER_Y } from "./rig";

/** Where the phone hand rests, relative to the +x shoulder (upper-body space): beside the cheek. */
const HAND = { x: 0.08, y: 0.34, z: 0.195 } as const;
const REACH = Math.hypot(HAND.x, HAND.y, HAND.z);

/**
 * Euler XYZ angles that raise the +x arm (hanging along -y) to the cheek;
 * same construction as the seated keyboard arm in `rig.ts`.
 */
export const PHONE_ARM: ArmAngles = {
	x: Math.atan2(-HAND.z, -HAND.y),
	z: Math.asin(HAND.x / REACH),
};

/** Handset thickness across the head's side. */
const THICK = 0.04;
/**
 * Handset axis in upper-body space: earpiece in the hand by the ear, mouthpiece
 * down and forward by the chin. It sits as far out as the hand, so no hairstyle
 * swallows it.
 */
const EAR = new Vector3(SHOULDER_X + HAND.x - 0.035, HEAD.y + 0.03, 0.1);
const MOUTH = new Vector3(EAR.x, HEAD.y - 0.2, 0.25);

/** Upper-body to arm space for the posed +x arm. */
const toArm = new Quaternion().setFromEuler(new Euler(PHONE_ARM.x, 0, PHONE_ARM.z)).invert();
const shoulder = new Vector3(SHOULDER_X, SHOULDER_Y, 0);
const axis = MOUTH.clone().sub(EAR);
const LENGTH = axis.length();
/** Handset's local +z runs ear → mouth (a tilt about x in upper-body space). */
const tilt = new Quaternion().setFromEuler(new Euler(Math.atan2(-axis.y, axis.z), 0, 0));
const rotation = new Euler().setFromQuaternion(toArm.clone().multiply(tilt));
const ROTATION: [number, number, number] = [rotation.x, rotation.y, rotation.z];

/** A point `along` the handset (0 = ear, 1 = mouth), pushed `out` away from the head, in arm space. */
function onHandset(along: number, out: number): [number, number, number] {
	const p = EAR.clone()
		.addScaledVector(axis, along)
		.add(new Vector3(out, 0, 0))
		.sub(shoulder)
		.applyQuaternion(toArm);
	return [p.x, p.y, p.z];
}

/**
 * A blocky phone handset held to the +x ear, in arm space (child of the arm
 * group posed at `PHONE_ARM`). The ear and mouth cups overlap the grip and are
 * larger than it in every direction they share, so no two colours share a face.
 */
export const HELD_PHONE: readonly Cuboid[] = [
	{ color: "#ece6d8", at: onHandset(0.5, 0), size: [THICK, 0.05, LENGTH], rotation: ROTATION },
	{ color: "#34363d", at: onHandset(0.08, 0.008), size: [0.05, 0.075, 0.085], rotation: ROTATION },
	{ color: "#34363d", at: onHandset(0.92, 0.008), size: [0.05, 0.075, 0.085], rotation: ROTATION },
];

/** `PHONE_ARM` for the -x arm: the mirror image across the body's centre plane. */
export const PHONE_ARM_MIRRORED: ArmAngles = { x: PHONE_ARM.x, z: -PHONE_ARM.z };

/** `HELD_PHONE` mirrored into the -x arm (posed at `PHONE_ARM_MIRRORED`). */
export const HELD_PHONE_MIRRORED: readonly Cuboid[] = HELD_PHONE.map((part) => ({
	...part,
	at: [-part.at[0], part.at[1], part.at[2]],
	rotation: [ROTATION[0], -ROTATION[1], -ROTATION[2]],
}));

/**
 * Which hand (rig index) holds the phone for a body turned `rotationY`: the one
 * on the camera's side, so the handset never hides behind the head. The office
 * camera looks down from +x +z (see `VIEW_DIRECTION`), and the body's +x axis
 * points along (cos r, 0, -sin r).
 */
export function phoneHand(rotationY: number): 0 | 1 {
	return Math.cos(rotationY) - Math.sin(rotationY) >= 0 ? 0 : 1;
}
