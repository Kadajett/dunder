import type { GlassesStyle, HeadwearStyle } from "@shared/avatar/style";
import { type Cuboid, mirrored } from "./Block";
import { EYE, FACE_Z } from "./face";
import { CLOTH_GAP } from "./rig";

/** Thin, light frames: the eyes stay the focus, the glasses read as an outline around them. */
const FRAME: Record<GlassesStyle, { color: string; width: number; height: number; bar: number }> = {
	round: { color: "#c79a46", width: 0.098, height: 0.088, bar: 0.012 },
	square: { color: "#5c4a40", width: 0.11, height: 0.08, bar: 0.014 },
	// Tall enough to cover the widest eye with room above and below.
	shades: { color: "#2b3140", width: 0.108, height: 0.074, bar: 0 },
};

const LENS_Z = FACE_Z + 0.025;

/** One lens outline on `side`: four bars, or a solid dark lens for shades. */
function lens(style: GlassesStyle, side: 1 | -1): Cuboid[] {
	const { color, width, height, bar } = FRAME[style];
	const x = side * EYE.x;
	const { y } = EYE;
	if (bar === 0) return [{ color, at: [x, y, LENS_Z], size: [width, height, 0.02] }];
	return [
		{ color, at: [x, y + (height - bar) / 2, LENS_Z], size: [width, bar, bar] },
		{ color, at: [x, y - (height - bar) / 2, LENS_Z], size: [width, bar, bar] },
		{ color, at: [x + (width - bar) / 2, y, LENS_Z], size: [bar, height, bar] },
		{ color, at: [x - (width - bar) / 2, y, LENS_Z], size: [bar, height, bar] },
	];
}

/** Glasses in head space: lenses over the eyes, a bridge, and arms back to the ears. */
export function glassesBlocks(style: GlassesStyle): Cuboid[] {
	const { color, width } = FRAME[style];
	// The bridge spans the gap between the lenses' inner edges, overlapping each a little.
	const bridge = 2 * (EYE.x - width / 2) + 0.012;
	return [
		...lens(style, 1),
		...lens(style, -1),
		{ color, at: [0, EYE.y + 0.015, LENS_Z], size: [bridge, 0.014, 0.014] },
		// Arms clear the skull (x 0.22) without lining up with the side hair's outer face (x 0.24).
		...mirrored(color, [0.229, EYE.y + 0.02, 0.11], [0.012, 0.012, 0.22]),
	];
}

/**
 * The outer shell of every hat-compatible hairstyle: crown and fringe front at
 * z 0.22, back panel at z -0.24, side hair at x ±0.24, curtains out to x ±0.27.
 * Headwear stands `CLOTH_GAP` proud of it, so hat and hair never share a face.
 */
const HAIR = { front: 0.22, back: -0.24, side: 0.24, curtain: 0.27 } as const;
const HAT_DEPTH = HAIR.front - HAIR.back + 2 * CLOTH_GAP;
const HAT_Z = (HAIR.front + HAIR.back) / 2;
/** Headphone arms run down outside even the curtains. */
const PHONES_X = HAIR.curtain + CLOTH_GAP - 0.015;

/** Hat or headphones in head space; sized to sit over any hat-compatible hairstyle. */
export function headwearBlocks(style: HeadwearStyle, color: string): Cuboid[] {
	switch (style) {
		case "cap":
			return [
				{ color, at: [0, 0.25, HAT_Z], size: [0.49, 0.13, HAT_DEPTH] },
				{ color, at: [0, 0.2, 0.3], size: [0.45, 0.03, 0.2] },
				{ color, at: [0, 0.325, HAT_Z], size: [0.05, 0.02, 0.05] },
			];
		case "beanie":
			return [
				{ color, at: [0, 0.26, HAT_Z], size: [0.49, 0.16, HAT_DEPTH] },
				// The turned-up brim wraps the beanie and clears the curtains' back panel (x ±0.25).
				{
					color,
					at: [0, 0.18, HAT_Z],
					size: [0.5 + 2 * CLOTH_GAP, 0.07, HAT_DEPTH + 2 * CLOTH_GAP],
				},
				{ color, at: [0, 0.375, HAT_Z], size: [0.09, 0.07, 0.09] },
			];
		case "headphones":
			return [
				{ color, at: [0, 0.29, 0], size: [2 * (PHONES_X + 0.015), 0.04, 0.07] },
				...mirrored(color, [PHONES_X, 0.15, 0], [0.03, 0.26, 0.06]),
				...mirrored(color, [0.265, -0.01, 0], [0.06, 0.15, 0.14]),
			];
		case "bandana":
			// Ties round the hair below the tops of the side and back hair (y 0.19), which puff over it.
			return [
				{
					color,
					at: [0, 0.1445, HAT_Z],
					size: [2 * (HAIR.side + CLOTH_GAP), 0.079, HAT_DEPTH],
				},
				{ color, at: [0, 0.13, -0.25], size: [0.1, 0.08, 0.06] },
				{ color, at: [0, 0.05, -0.255], size: [0.06, 0.12, 0.03] },
			];
	}
}
