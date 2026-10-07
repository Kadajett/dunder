import { useFrame } from "@react-three/fiber";
import type { AvatarStyle } from "@shared/avatar/style";
import { useMemo } from "react";
import { animateRig } from "./animate";
import { Block, Blocks } from "./Block";
import { animateExercise } from "./exercise";
import { HELD_CUE } from "./held-cue";
import { HELD_PHONE, HELD_PHONE_MIRRORED } from "./held-phone";
import { pantsColorFor } from "./outfits";
import { armPart, facePart, headPart, upperPart } from "./parts";
import {
	createRig,
	HEAD,
	HIP_X,
	HIP_Y,
	LEG_WIDTH,
	type MiiActivity,
	type MiiPose,
	type Rig,
	SHIN,
	SHOULDER_X,
	SHOULDER_Y,
	THIGH,
} from "./rig";

export type { MiiActivity, MiiPose } from "./rig";

export interface MiiCharacterProps {
	style: AvatarStyle;
	/** `seated` puts the hips at y ≈ 0.48 over a 0.46 m chair seat, hands on a keyboard ahead. */
	pose: MiiPose;
	/** Body language over the pose: typing, idling, slumped (blocked) or stretching (done). */
	activity: MiiActivity;
	/** Seconds added to the animation clock so neighbours don't move in lockstep. */
	phase?: number;
	/** Epoch ms of the workout signal; the `exercising` pose is a function of time since then. */
	workoutStartedAt?: number;
	/** The arm (rig index) holding the handset during `phone`: pick the camera-side one (`phoneHand`). */
	phoneHand?: Side;
}

type Side = 0 | 1;

function Leg({
	rig,
	index,
	pants,
	shoes,
}: {
	rig: Rig;
	index: Side;
	pants: string;
	shoes: string;
}) {
	return (
		<group ref={rig.thighs[index]} position={[index === 0 ? HIP_X : -HIP_X, 0, 0]}>
			{/* Overlaps the torso above and the shin below so bent joints never gap. */}
			<Block color={pants} at={[0, -THIGH / 2, 0]} size={[LEG_WIDTH, THIGH + 0.08, 0.16]} />
			<group ref={rig.knees[index]} position={[0, -THIGH, 0]}>
				<group ref={rig.shins[index]}>
					<Block color={pants} at={[0, -SHIN / 2, 0]} size={[LEG_WIDTH - 0.01, SHIN, 0.15]} />
				</group>
				<group ref={rig.feet[index]} position={[0, -SHIN, 0]}>
					<Block color={shoes} at={[0, -0.035, 0.03]} size={[LEG_WIDTH + 0.01, 0.07, 0.22]} />
				</group>
			</group>
		</group>
	);
}

/**
 * A low-poly voxel office worker built from boxes: big cube head, block body.
 * Feet rest on y = 0 when standing (≈1.4 m tall); faces local +z.
 */
export function MiiCharacter({
	style,
	pose,
	activity,
	phase = 0,
	workoutStartedAt = 0,
	phoneHand = 0,
}: MiiCharacterProps) {
	const rig = useMemo(createRig, []);
	const motion = useMemo(() => ({ pose, activity, phoneHand }), [pose, activity, phoneHand]);
	useFrame(({ clock }) => {
		// Exercise ignores `phase`: every participant moves in sync with the shared signal.
		if (pose === "exercising") animateExercise(rig, (Date.now() - workoutStartedAt) / 1_000);
		else animateRig(rig, motion, clock.elapsedTime + phase);
	});
	const head = useMemo(() => headPart(style), [style]);
	const face = useMemo(() => facePart(style), [style]);
	const upper = useMemo(() => upperPart(style), [style]);
	const arm = useMemo(() => armPart(style), [style]);
	const pants = pantsColorFor(style);
	return (
		<group ref={rig.root}>
			<group position={[0, HIP_Y, 0]}>
				<Leg rig={rig} index={0} pants={pants} shoes={style.shoes} />
				<Leg rig={rig} index={1} pants={pants} shoes={style.shoes} />
				<group ref={rig.upper}>
					<Blocks items={upper} />
					<group ref={rig.head} position={[0, HEAD.y, 0]}>
						<Blocks items={head} />
						<Blocks items={face} castShadow={false} />
					</group>
					{([0, 1] as const).map((index) => (
						<group
							key={index}
							ref={rig.arms[index]}
							position={[index === 0 ? SHOULDER_X : -SHOULDER_X, SHOULDER_Y, 0]}
						>
							<Blocks items={arm} />
							{index === 0 && activity === "cue" ? <Blocks items={HELD_CUE} /> : null}
							{index === phoneHand && activity === "phone" ? (
								<Blocks items={index === 0 ? HELD_PHONE : HELD_PHONE_MIRRORED} />
							) : null}
						</group>
					))}
				</group>
			</group>
		</group>
	);
}
