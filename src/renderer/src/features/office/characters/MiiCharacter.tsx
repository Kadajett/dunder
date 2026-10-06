import { useFrame } from "@react-three/fiber";
import type { AvatarStyle } from "@shared/avatar/style";
import { useMemo } from "react";
import { glassesBlocks, headwearBlocks } from "./accessories";
import { animateRig } from "./animate";
import { Block, Blocks, type Cuboid } from "./Block";
import { animateExercise } from "./exercise";
import { type FaceStyle, faceDecals, headBlocks } from "./face";
import { hairBlocks } from "./hair";
import { outfitBlocks, pantsColorFor, type Sleeve, sleeveFor } from "./outfits";
import {
	ARM_REACH,
	ARM_WIDTH,
	createRig,
	HEAD,
	HIP_X,
	HIP_Y,
	LEG_WIDTH,
	type MiiActivity,
	type MiiPose,
	NECK_Y,
	type Rig,
	SHIN,
	SHOULDER_X,
	SHOULDER_Y,
	THIGH,
	TORSO,
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

/** Arm blocks hanging from the shoulder pivot (−y), hand at `ARM_REACH`. */
function armBlocks(sleeve: Sleeve, skin: string): Cuboid[] {
	const wide = ARM_WIDTH + 0.016;
	const blocks: Cuboid[] = [
		{
			color: sleeve.long ? sleeve.color : skin,
			at: [0, -0.17, 0],
			size: [ARM_WIDTH, 0.36, ARM_WIDTH],
		},
		{ color: skin, at: [0, -ARM_REACH, 0], size: [0.1, 0.1, 0.1] },
	];
	if (!sleeve.long)
		blocks.push({ color: sleeve.color, at: [0, -0.055, 0], size: [wide, 0.13, wide] });
	if (sleeve.cuff) {
		const cuff = sleeve.long ? { y: -0.33, height: 0.04 } : { y: -0.115, height: 0.025 };
		blocks.push({
			color: sleeve.cuff,
			at: [0, cuff.y, 0],
			size: [wide - 0.004, cuff.height, wide - 0.004],
		});
	}
	return blocks;
}

function faceStyleOf(style: AvatarStyle): FaceStyle {
	return {
		skin: style.skin,
		browColor: style.hair.color,
		eyes: style.eyes,
		brows: style.brows,
		mouth: style.mouth,
	};
}

/** Everything on the head that has volume: skull, brows, hair, glasses and headwear. */
function headVolume(style: AvatarStyle): Cuboid[] {
	return [
		...headBlocks(faceStyleOf(style)),
		...hairBlocks(style.hair.style, style.hair.color),
		...(style.glasses ? glassesBlocks(style.glasses) : []),
		...(style.headwear ? headwearBlocks(style.headwear.style, style.headwear.color) : []),
	];
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
}: MiiCharacterProps) {
	const rig = useMemo(createRig, []);
	useFrame(({ clock }) => {
		// Exercise ignores `phase`: every participant moves in sync with the shared signal.
		if (pose === "exercising") animateExercise(rig, (Date.now() - workoutStartedAt) / 1_000);
		else animateRig(rig, pose, activity, clock.elapsedTime + phase);
	});
	const head = useMemo(() => headVolume(style), [style]);
	const face = useMemo(() => faceDecals(faceStyleOf(style)), [style]);
	const torso = useMemo(() => outfitBlocks(style.outfit), [style.outfit]);
	const arm = useMemo(
		() => armBlocks(sleeveFor(style.outfit), style.skin),
		[style.outfit, style.skin],
	);
	const pants = pantsColorFor(style);
	return (
		<group ref={rig.root}>
			<group position={[0, HIP_Y, 0]}>
				<Leg rig={rig} index={0} pants={pants} shoes={style.shoes} />
				<Leg rig={rig} index={1} pants={pants} shoes={style.shoes} />
				<group ref={rig.upper}>
					<group position={[0, TORSO.y, 0]}>
						<Blocks items={torso} />
					</group>
					<Block color={style.skin} at={[0, NECK_Y, 0]} size={[0.14, 0.06, 0.14]} />
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
						</group>
					))}
				</group>
			</group>
		</group>
	);
}
