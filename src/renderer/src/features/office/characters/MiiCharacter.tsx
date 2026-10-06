import { useFrame } from "@react-three/fiber";
import type { AvatarStyle } from "@shared/avatar/style";
import { useMemo } from "react";
import { Glasses, Headwear } from "./accessories";
import { animateRig } from "./animate";
import { animateExercise } from "./exercise";
import { Face } from "./face";
import { GEO, SKULL_SCALE } from "./geometry";
import { Hair } from "./hair";
import { OutfitTorso, pantsColorFor, type Sleeve, sleeveFor } from "./outfits";
import { Part } from "./Part";
import {
	ARM_REACH,
	createRig,
	HEAD_Y,
	HIP_X,
	HIP_Y,
	type MiiActivity,
	type MiiPose,
	NECK_Y,
	type Rig,
	SHIN,
	SHOULDER_X,
	SHOULDER_Y,
	THIGH,
	TORSO_Y,
} from "./rig";

export type { MiiActivity, MiiPose } from "./rig";

export interface MiiCharacterProps {
	style: AvatarStyle;
	/** `seated` puts the hips at y ≈ 0.48 over a 0.46 m chair seat, hands on a keyboard ahead. */
	pose: MiiPose;
	/** `waving` raises the camera-side arm: the agent is blocked and needs the human. */
	activity: MiiActivity;
	/** Seconds added to the animation clock so neighbours don't move in lockstep. */
	phase?: number;
	/** Epoch ms of the workout signal; the `exercising` pose is a function of time since then. */
	workoutStartedAt?: number;
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
			<Part geometry={GEO.thigh} color={pants} position={[0, -THIGH / 2, 0]} />
			<group ref={rig.knees[index]} position={[0, -THIGH, 0]}>
				<group ref={rig.shins[index]}>
					<Part geometry={GEO.shin} color={pants} position={[0, -SHIN / 2, 0]} />
				</group>
				<group ref={rig.feet[index]} position={[0, -SHIN, 0]}>
					<Part geometry={GEO.shoe} color={shoes} position={[0, -0.035, 0.03]} />
				</group>
			</group>
		</group>
	);
}

function Arm({
	rig,
	index,
	sleeve,
	skin,
}: {
	rig: Rig;
	index: Side;
	sleeve: Sleeve;
	skin: string;
}) {
	return (
		<group ref={rig.arms[index]} position={[index === 0 ? SHOULDER_X : -SHOULDER_X, SHOULDER_Y, 0]}>
			<Part geometry={GEO.arm} color={sleeve.long ? sleeve.color : skin} position={[0, -0.18, 0]} />
			{sleeve.long ? null : (
				<Part geometry={GEO.sleeve} color={sleeve.color} position={[0, -0.055, 0]} />
			)}
			{sleeve.cuff ? (
				<Part
					geometry={GEO.cuff}
					color={sleeve.cuff}
					position={[0, sleeve.long ? -0.32 : -0.115, 0]}
					scale={sleeve.long ? 1 : [1.15, 0.6, 1.15]}
				/>
			) : null}
			<Part geometry={GEO.hand} color={skin} position={[0, -ARM_REACH, 0]} />
		</group>
	);
}

function Head({ style }: { style: AvatarStyle }) {
	return (
		<group scale={SKULL_SCALE}>
			<Face
				skin={style.skin}
				browColor={style.hair.color}
				eyes={style.eyes}
				brows={style.brows}
				mouth={style.mouth}
			/>
			<Hair style={style.hair.style} color={style.hair.color} />
			{style.glasses ? <Glasses style={style.glasses} /> : null}
			{style.headwear ? <Headwear {...style.headwear} /> : null}
		</group>
	);
}

/**
 * A Mii-style office worker: big round head, dot eyes, small rounded body.
 * Feet rest on y = 0 when standing (≈1.45 m tall); faces local +z.
 */
export function MiiCharacter({
	style,
	pose,
	activity,
	phase = 0,
	workoutStartedAt = 0,
}: MiiCharacterProps) {
	const rig = useMemo(createRig, []);
	useFrame(({ clock }) => {
		// Exercise ignores `phase`: every participant moves in sync with the shared signal.
		if (pose === "exercising") animateExercise(rig, (Date.now() - workoutStartedAt) / 1_000);
		else animateRig(rig, pose, activity, clock.elapsedTime + phase);
	});
	const sleeve = sleeveFor(style.outfit);
	const pants = pantsColorFor(style);
	return (
		<group ref={rig.root}>
			<group position={[0, HIP_Y, 0]}>
				<Leg rig={rig} index={0} pants={pants} shoes={style.shoes} />
				<Leg rig={rig} index={1} pants={pants} shoes={style.shoes} />
				<group ref={rig.upper}>
					<group position={[0, TORSO_Y, 0]}>
						<OutfitTorso outfit={style.outfit} />
					</group>
					<Part geometry={GEO.neck} color={style.skin} position={[0, NECK_Y, 0]} />
					<group ref={rig.head} position={[0, HEAD_Y, 0]}>
						<Head style={style} />
					</group>
					<Arm rig={rig} index={0} sleeve={sleeve} skin={style.skin} />
					<Arm rig={rig} index={1} sleeve={sleeve} skin={style.skin} />
				</group>
			</group>
		</group>
	);
}
