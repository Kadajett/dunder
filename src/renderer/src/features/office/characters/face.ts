import type { BrowStyle, EyeStyle, MouthStyle } from "@shared/avatar/style";
import { type Cuboid, mirrored, type Vec3 } from "./Block";
import { HEAD } from "./rig";

const INK = "#2b211c";
const EYE_WHITE = "#fbf7f0";
const LIP = "#6e2f2c";

/** Front face of the head block; features sit just proud of it. */
export const FACE_Z = HEAD.depth / 2;
const ON_FACE = FACE_Z + 0.006;
/** Eye centres, mirrored across x. */
export const EYE = { x: 0.09, y: 0 } as const;
const FEATURE_DEPTH = 0.02;

const EYE_SIZE: Record<EyeStyle, Vec3> = {
	dot: [0.05, 0.06, FEATURE_DEPTH],
	oval: [0.045, 0.085, FEATURE_DEPTH],
	sleepy: [0.07, 0.022, FEATURE_DEPTH],
	wide: [0.08, 0.08, FEATURE_DEPTH],
};

function eyes(style: EyeStyle): Cuboid[] {
	const y = style === "sleepy" ? EYE.y - 0.012 : EYE.y;
	const eye = mirrored(style === "wide" ? EYE_WHITE : INK, [EYE.x, y, ON_FACE], EYE_SIZE[style]);
	if (style !== "wide") return eye;
	return [...eye, ...mirrored(INK, [EYE.x, y - 0.006, ON_FACE + 0.01], [0.04, 0.045, 0.01])];
}

/** Brow roll (positive raises the outer end), lift and thickness per style. */
const BROWS: Record<BrowStyle, { roll: number; lift: number; thickness: number }> = {
	flat: { roll: 0, lift: 0, thickness: 1 },
	raised: { roll: -0.22, lift: 0.014, thickness: 1 },
	angled: { roll: 0.3, lift: 0, thickness: 1.1 },
	thick: { roll: 0.05, lift: 0, thickness: 1.8 },
};

function brows(style: BrowStyle, color: string): Cuboid[] {
	const brow = BROWS[style];
	return mirrored(
		color,
		[EYE.x, 0.085 + brow.lift, ON_FACE],
		[0.09, 0.022 * brow.thickness, FEATURE_DEPTH],
		[0, 0, brow.roll],
	);
}

const MOUTH_Y = -0.105;

function mouth(style: MouthStyle): Cuboid[] {
	switch (style) {
		case "smile":
			return [
				{ color: LIP, at: [0, MOUTH_Y - 0.005, ON_FACE], size: [0.08, 0.02, FEATURE_DEPTH] },
				...mirrored(LIP, [0.05, MOUTH_Y + 0.01, ON_FACE], [0.022, 0.022, FEATURE_DEPTH]),
			];
		case "smirk":
			return [
				{ color: LIP, at: [0.005, MOUTH_Y, ON_FACE], size: [0.07, 0.02, FEATURE_DEPTH] },
				{ color: LIP, at: [0.05, MOUTH_Y + 0.015, ON_FACE], size: [0.022, 0.022, FEATURE_DEPTH] },
			];
		case "grin":
			return [
				{ color: LIP, at: [0, MOUTH_Y, ON_FACE], size: [0.13, 0.055, FEATURE_DEPTH] },
				{ color: EYE_WHITE, at: [0, MOUTH_Y + 0.012, ON_FACE + 0.006], size: [0.11, 0.022, 0.012] },
			];
		case "flat":
			return [{ color: LIP, at: [0, MOUTH_Y, ON_FACE], size: [0.08, 0.018, FEATURE_DEPTH] }];
		case "open":
			return [{ color: LIP, at: [0, MOUTH_Y - 0.005, ON_FACE], size: [0.06, 0.06, FEATURE_DEPTH] }];
	}
}

export interface FaceStyle {
	readonly skin: string;
	readonly browColor: string;
	readonly eyes: EyeStyle;
	readonly brows: BrowStyle;
	readonly mouth: MouthStyle;
}

/** Head cube, ears, nose and face, in head space (centre of the head block). */
export function faceBlocks(face: FaceStyle): Cuboid[] {
	return [
		{ color: face.skin, at: [0, 0, 0], size: [HEAD.width, HEAD.height, HEAD.depth] },
		...mirrored(face.skin, [HEAD.width / 2 + 0.015, -0.01, -0.01], [0.04, 0.1, 0.09]),
		{ color: face.skin, at: [0, -0.04, FACE_Z + 0.015], size: [0.05, 0.05, 0.04] },
		...eyes(face.eyes),
		...brows(face.brows, face.browColor),
		...mouth(face.mouth),
	];
}
