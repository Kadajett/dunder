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
		thigh.rotation.x = leg.hip;
		knee.rotation.x = leg.knee;
		shin.scale.y = shinScale;
		foot.position.y = -SHIN * shinScale;
		// Keep soles parallel to the floor.
		foot.rotation.x = -(leg.hip + leg.knee);
	}
}

function animateUpper(rig: Rig, pose: MiiPose, activity: MiiActivity, t: number): void {
	const root = rig.root.current;
	const upper = rig.upper.current;
	const head = rig.head.current;
	if (!root || !upper || !head) return;
	const walking = pose === "walking";
	root.position.y = walking ? 0.025 * Math.abs(Math.sin(WALK * t)) : 0;
	upper.rotation.x = pose === "seated" ? SEATED_LEAN : walking ? 0.06 : 0;
	upper.rotation.y = walking ? 0.06 * Math.sin(WALK * t) : 0;
	upper.scale.y = 1 + 0.012 * Math.sin(t * 2.2);
	const typing = activity === "typing" && !walking;
	const waving = activity === "waving";
	head.rotation.x = typing ? 0.06 + 0.035 * Math.sin(t * 9) : 0.03 * Math.sin(t * 0.9);
	head.rotation.y = waving ? 0.25 : typing ? 0.05 * Math.sin(t * 0.7) : 0.32 * Math.sin(t * 0.5);
	head.rotation.z = waving ? 0.12 * Math.sin(t * 3) : 0;
}

/** Writes the angles of arm `i` (0 = +x side) into the shared `arm` scratch object. */
function armPose(pose: MiiPose, activity: MiiActivity, i: number, t: number): void {
	const side = i === 0 ? 1 : -1;
	if (activity === "waving" && i === 0) {
		arm.x = -0.15;
		arm.z = 2.75 + 0.3 * Math.sin(t * 9);
	} else if (pose === "seated") {
		const rest = SEATED_ARMS[i === 0 ? 0 : 1];
		const tap = activity === "typing" ? 0.09 * Math.max(0, Math.sin(t * 14 + i * 2.2)) : 0;
		arm.x = rest.x - tap;
		arm.z = rest.z;
	} else if (pose === "walking") {
		arm.x = -0.45 * Math.sin(WALK * t + i * Math.PI);
		arm.z = side * 0.1;
	} else {
		arm.x = 0.04 * Math.sin(t * 1.1 + i);
		arm.z = side * (0.1 + 0.02 * Math.sin(t * 2.2));
	}
}

/** Poses every joint for time `t` (seconds, already offset by the character's phase). */
export function animateRig(rig: Rig, pose: MiiPose, activity: MiiActivity, t: number): void {
	animateLegs(rig, pose, t);
	animateUpper(rig, pose, activity, t);
	for (let i = 0; i < 2; i++) {
		const group = rig.arms[i]?.current;
		if (!group) continue;
		armPose(pose, activity, i, t);
		group.rotation.x = arm.x;
		group.rotation.z = arm.z;
	}
}
