import type { BrowStyle, EyeStyle, MouthStyle } from "@shared/avatar/style";
import { Color } from "three";
import { type Cuboid, mirrored, type Vec3 } from "./Block";
import { HEAD } from "./rig";

/** Soft near-black for eyes and mouth: friendlier than pure black, still reads on dark skin. */
const INK = "#241a16";
const CATCHLIGHT = "#fbf7f0";
/** Cheeks are the skin warmed toward this rose, so blush suits every skin tone. */
const ROSE = "#e8606a";
const BLUSH_MIX = 0.38;

/** Front face of the head block; features sit just proud of it. */
export const FACE_Z = HEAD.depth / 2;
const ON_FACE = FACE_Z + 0.006;
/**
 * Eye centres, mirrored across x: set wide and a little below the middle of
 * the visible face (hair covers the top), which reads young and friendly.
 */
export const EYE = { x: 0.1, y: -0.025 } as const;
const FEATURE_DEPTH = 0.02;
const LINE = 0.016;

/** Highlights sit up and toward the sun (+x) on both eyes, like a real reflection. */
const CATCH_OFFSET = { x: 0.013, y: 0.014 } as const;

function eyes(style: EyeStyle): Cuboid[] {
	const at: Vec3 = [EYE.x, EYE.y, ON_FACE];
	switch (style) {
		case "dot":
			return mirrored(INK, at, [0.05, 0.055, FEATURE_DEPTH]);
		case "oval":
			return mirrored(INK, at, [0.042, 0.068, FEATURE_DEPTH]);
		case "wide":
			return [
				...mirrored(INK, at, [0.062, 0.066, FEATURE_DEPTH]),
				...[EYE.x, -EYE.x].map(
					(x): Cuboid => ({
						color: CATCHLIGHT,
						at: [x + CATCH_OFFSET.x, EYE.y + CATCH_OFFSET.y, ON_FACE + 0.006],
						size: [0.02, 0.02, FEATURE_DEPTH],
					}),
				),
			];
		case "sleepy":
			// Closed, smiling eyes: a little ^ per eye.
			return [
				...mirrored(
					INK,
					[EYE.x - 0.013, EYE.y, ON_FACE],
					[0.036, LINE, FEATURE_DEPTH],
					[0, 0, 0.55],
				),
				...mirrored(
					INK,
					[EYE.x + 0.013, EYE.y, ON_FACE],
					[0.036, LINE, FEATURE_DEPTH],
					[0, 0, -0.55],
				),
			];
	}
}

const BROW_Y = EYE.y + 0.078;

/** Brows sit well above the eyes and never tilt inward, so no style reads as a frown. */
function brows(style: BrowStyle, color: string): Cuboid[] {
	switch (style) {
		case "flat":
			return mirrored(color, [EYE.x, BROW_Y, ON_FACE], [0.062, LINE, FEATURE_DEPTH]);
		case "raised":
			return mirrored(color, [EYE.x, BROW_Y + 0.018, ON_FACE], [0.058, LINE, FEATURE_DEPTH]);
		case "angled":
			// A soft arch: level over the inner eye, easing down at the outer end.
			return [
				...mirrored(color, [EYE.x - 0.01, BROW_Y + 0.006, ON_FACE], [0.042, LINE, FEATURE_DEPTH]),
				...mirrored(
					color,
					[EYE.x + 0.03, BROW_Y - 0.002, ON_FACE],
					[0.03, LINE, FEATURE_DEPTH],
					[0, 0, -0.5],
				),
			];
		case "thick":
			return mirrored(color, [EYE.x, BROW_Y, ON_FACE], [0.068, 0.026, FEATURE_DEPTH]);
	}
}

const MOUTH_Y = -0.115;

function mouth(style: MouthStyle, blush: string): Cuboid[] {
	switch (style) {
		case "smile":
			return [
				{ color: INK, at: [0, MOUTH_Y - 0.004, ON_FACE], size: [0.05, LINE, FEATURE_DEPTH] },
				...mirrored(INK, [0.033, MOUTH_Y + 0.008, ON_FACE], [LINE, 0.018, FEATURE_DEPTH]),
			];
		case "smirk":
			return [
				{ color: INK, at: [0.006, MOUTH_Y - 0.002, ON_FACE], size: [0.046, LINE, FEATURE_DEPTH] },
				{ color: INK, at: [0.036, MOUTH_Y + 0.01, ON_FACE], size: [LINE, 0.018, FEATURE_DEPTH] },
			];
		case "grin":
			// An open laugh: wide on top, narrower below, with a little tongue.
			return [
				{ color: INK, at: [0, MOUTH_Y + 0.01, ON_FACE], size: [0.088, LINE, FEATURE_DEPTH] },
				{ color: INK, at: [0, MOUTH_Y - 0.006, ON_FACE], size: [0.06, 0.022, FEATURE_DEPTH] },
				// The tongue is the mouth's bottom row, so the ink above it stays one solid shape.
				{ color: blush, at: [0, MOUTH_Y - 0.0225, ON_FACE], size: [0.036, 0.011, FEATURE_DEPTH] },
			];
		case "flat":
			return [{ color: INK, at: [0, MOUTH_Y, ON_FACE], size: [0.044, LINE, FEATURE_DEPTH] }];
		case "open":
			return [
				{ color: INK, at: [0, MOUTH_Y - 0.004, ON_FACE], size: [0.034, 0.038, FEATURE_DEPTH] },
			];
	}
}

export interface FaceStyle {
	readonly skin: string;
	readonly browColor: string;
	readonly eyes: EyeStyle;
	readonly brows: BrowStyle;
	readonly mouth: MouthStyle;
}

/** The skin tone warmed toward rose: cheeks and tongue. */
function blushFor(skin: string): string {
	return `#${new Color(skin).lerp(new Color(ROSE), BLUSH_MIX).getHexString()}`;
}

/**
 * Head cube, ears and brows, in head space (centre of the head block). No nose:
 * its shaded underside read as a third dark dot between the eyes and mouth.
 */
export function headBlocks(face: FaceStyle): Cuboid[] {
	return [
		{ color: face.skin, at: [0, 0, 0], size: [HEAD.width, HEAD.height, HEAD.depth] },
		...mirrored(face.skin, [HEAD.width / 2 + 0.015, -0.03, -0.01], [0.04, 0.09, 0.09]),
		// Brows share the hair's colour, so they merge into the hair's mesh.
		...brows(face.brows, face.browColor),
	];
}

/**
 * Eyes, mouth and cheeks: flat decals on the face, in head space. They are too
 * thin to cast a visible shadow, so the character draws them without one.
 */
export function faceDecals(face: FaceStyle): Cuboid[] {
	const blush = blushFor(face.skin);
	return [
		...eyes(face.eyes),
		...mouth(face.mouth, blush),
		...mirrored(blush, [0.138, -0.085, FACE_Z + 0.003], [0.052, 0.026, 0.012]),
	];
}
