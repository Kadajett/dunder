import type { RoutineStep } from "@shared/calisthenics";
import { Cue } from "../../calisthenics/routine";
import { type Rig, SHIN, THIGH } from "./rig";

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;
const LEG = THIGH + SHIN;

type Pair = [number, number];

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/**
 * Joint targets for one moment of a move. Index 0 is the +x side. Angles that
 * open a limb sideways (`legOut`, `kneeOut`, `armOut`) are positive outward on
 * both sides; the side's sign is applied when writing to the rig.
 */
class Pose {
	/** Thigh flexion; negative swings the leg forward. */
	readonly hip: Pair = [0, 0];
	readonly legOut: Pair = [0, 0];
	/** Shin bending back behind the thigh. */
	readonly knee: Pair = [0, 0];
	/** Shin folding back in under a spread thigh (warrior's bent front leg). */
	readonly kneeOut: Pair = [0, 0];
	/** Arm swing; negative is forward. */
	readonly armX: Pair = [0, 0];
	readonly armOut: Pair = [0, 0];
	upper = 0;
	headX = 0;
	headY = 0;
	hop = 0;
	/** Every left/right pair, for bulk resets and mirroring. */
	readonly #pairs: readonly Pair[] = [
		this.hip,
		this.legOut,
		this.knee,
		this.kneeOut,
		this.armX,
		this.armOut,
	];

	stand(): this {
		for (let i = 0; i < this.#pairs.length; i++) this.#pairs[i]?.fill(0);
		this.armOut.fill(0.12);
		this.upper = 0;
		this.headX = 0;
		this.headY = 0;
		this.hop = 0;
		return this;
	}

	/** The pose of `step` at `t` seconds into it. */
	move(step: RoutineStep, t: number): this {
		this.stand();
		const breath = Math.sin(t * 1.6);
		switch (step.move) {
			case "reach":
				this.armOut.fill(Math.PI - 0.22 + 0.06 * breath);
				this.upper = -0.07;
				this.headX = -0.28;
				break;
			case "tree":
				// Balance on the -x leg, the +x knee opened out with its sole at the other knee.
				this.hip[0] = -0.55;
				this.legOut[0] = 0.95;
				this.knee[0] = 2.0;
				this.armOut.fill(2.9 + 0.03 * breath);
				this.armX.fill(-0.12);
				break;
			case "warrior":
				// Lunge toward +x: front thigh out, shin back under the knee, back leg long, arms level.
				this.legOut[0] = 0.95;
				this.kneeOut[0] = 0.95;
				this.legOut[1] = 0.5;
				this.armOut.fill(HALF_PI + 0.03 * breath);
				this.headY = 0.9;
				break;
			case "fold":
				this.upper = 1.3 + 0.05 * breath;
				this.armX.fill(-1.45 - 0.05 * breath);
				this.armOut.fill(0.06);
				this.knee.fill(0.08);
				this.headX = 0.25;
				break;
			case "jacks":
				this.#jacks(t);
				break;
			case "breathe":
				this.#breathe(t);
				break;
		}
		return step.mirror ? this.#mirror() : this;
	}

	/** Jumping jacks at 1.2 per second: arms and legs open together, a hop between. */
	#jacks(t: number): void {
		const phase = t * TAU * 1.2;
		const open = (1 - Math.cos(phase)) / 2;
		const airborne = Math.abs(Math.sin(phase));
		this.armOut.fill(0.15 + 2.8 * open);
		this.legOut.fill(0.05 + 0.3 * open);
		this.knee.fill(0.18 * (1 - airborne));
		this.hip.fill(-0.09 * (1 - airborne));
		this.hop = 0.08 * airborne;
	}

	/** Slow arm circles in time with a four-second breath. */
	#breathe(t: number): void {
		const inhale = (1 - Math.cos((t * TAU) / 4)) / 2;
		this.armOut.fill(0.15 + 2.75 * inhale);
		this.headX = -0.22 * inhale;
		this.upper = -0.05 * inhale;
	}

	#mirror(): this {
		for (let i = 0; i < this.#pairs.length; i++) this.#pairs[i]?.reverse();
		this.headY = -this.headY;
		return this;
	}

	/** `a` blended toward `b` by `k`. */
	mix(a: Pose, b: Pose, k: number): this {
		for (let i = 0; i < 2; i++) {
			this.hip[i] = lerp(a.hip[i] ?? 0, b.hip[i] ?? 0, k);
			this.legOut[i] = lerp(a.legOut[i] ?? 0, b.legOut[i] ?? 0, k);
			this.knee[i] = lerp(a.knee[i] ?? 0, b.knee[i] ?? 0, k);
			this.kneeOut[i] = lerp(a.kneeOut[i] ?? 0, b.kneeOut[i] ?? 0, k);
			this.armX[i] = lerp(a.armX[i] ?? 0, b.armX[i] ?? 0, k);
			this.armOut[i] = lerp(a.armOut[i] ?? 0, b.armOut[i] ?? 0, k);
		}
		this.upper = lerp(a.upper, b.upper, k);
		this.headX = lerp(a.headX, b.headX, k);
		this.headY = lerp(a.headY, b.headY, k);
		this.hop = lerp(a.hop, b.hop, k);
		return this;
	}

	/** How far leg `i` reaches below the hip, so the lowest foot can stay on the floor. */
	legDrop(i: number): number {
		const hip = this.hip[i] ?? 0;
		const out = this.legOut[i] ?? 0;
		const thigh = THIGH * Math.cos(hip) * Math.cos(out);
		const shin =
			SHIN * Math.cos(hip + (this.knee[i] ?? 0)) * Math.cos(out - (this.kneeOut[i] ?? 0));
		return thigh + shin;
	}
}

function writeLimbs(rig: Rig, pose: Pose, i: number): void {
	const side = i === 0 ? 1 : -1;
	const out = side * (pose.legOut[i] ?? 0);
	const kneeOut = side * (pose.kneeOut[i] ?? 0);
	const hip = pose.hip[i] ?? 0;
	const knee = pose.knee[i] ?? 0;
	rig.thighs[i]?.current?.rotation.set(hip, 0, out);
	rig.knees[i]?.current?.rotation.set(knee, 0, -kneeOut);
	rig.shins[i]?.current?.scale.set(1, 1, 1);
	const foot = rig.feet[i]?.current;
	if (foot) {
		foot.position.y = -SHIN;
		// Keep soles roughly parallel to the floor.
		foot.rotation.set(-(hip + knee), 0, kneeOut - out);
	}
	rig.arms[i]?.current?.rotation.set(pose.armX[i] ?? 0, 0, side * (pose.armOut[i] ?? 0));
}

function writeRig(rig: Rig, pose: Pose): void {
	const root = rig.root.current;
	if (root) root.position.y = Math.max(pose.legDrop(0), pose.legDrop(1)) - LEG + pose.hop;
	rig.upper.current?.rotation.set(pose.upper, 0, 0);
	rig.head.current?.rotation.set(pose.headX, pose.headY, 0);
	writeLimbs(rig, pose, 0);
	writeLimbs(rig, pose, 1);
}

/** Reused scratch so the frame loop never allocates. */
const cue = new Cue();
const from = new Pose();
const to = new Pose();
const blended = new Pose();

/** Poses the rig for `elapsed` seconds into the group workout; identical for every participant. */
export function animateExercise(rig: Rig, elapsed: number): void {
	const { step, previous, local, blend } = cue.at(elapsed);
	if (!step) writeRig(rig, blended.stand());
	else if (blend >= 1) writeRig(rig, blended.move(step, local));
	else {
		if (previous) from.move(previous, previous.seconds);
		else from.stand();
		writeRig(rig, blended.mix(from, to.move(step, local), blend));
	}
}
