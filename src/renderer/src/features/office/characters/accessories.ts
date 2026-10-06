import type { GlassesStyle, HeadwearStyle } from "@shared/avatar/style";
import { type Cuboid, mirrored } from "./Block";
import { EYE, FACE_Z } from "./face";

/** Thin, light frames: the eyes stay the focus, the glasses read as an outline around them. */
const FRAME: Record<GlassesStyle, { color: string; width: number; height: number; bar: number }> = {
	round: { color: "#c79a46", width: 0.098, height: 0.088, bar: 0.012 },
	square: { color: "#5c4a40", width: 0.11, height: 0.08, bar: 0.014 },
	shades: { color: "#2b3140", width: 0.108, height: 0.064, bar: 0 },
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
		...mirrored(color, [0.227, EYE.y + 0.02, 0.11], [0.014, 0.014, 0.22]),
	];
}

/** Hat or headphones in head space; sized to sit over any hat-compatible hairstyle. */
export function headwearBlocks(style: HeadwearStyle, color: string): Cuboid[] {
	switch (style) {
		case "cap":
			return [
				{ color, at: [0, 0.25, -0.01], size: [0.49, 0.13, 0.46] },
				{ color, at: [0, 0.2, 0.3], size: [0.45, 0.03, 0.2] },
				{ color, at: [0, 0.325, -0.01], size: [0.05, 0.02, 0.05] },
			];
		case "beanie":
			return [
				{ color, at: [0, 0.26, -0.01], size: [0.49, 0.16, 0.46] },
				{ color, at: [0, 0.18, -0.01], size: [0.5, 0.07, 0.47] },
				{ color, at: [0, 0.375, -0.01], size: [0.09, 0.07, 0.09] },
			];
		case "headphones":
			return [
				{ color, at: [0, 0.29, 0], size: [0.5, 0.04, 0.07] },
				...mirrored(color, [0.255, 0.15, 0], [0.03, 0.26, 0.06]),
				...mirrored(color, [0.265, -0.01, 0], [0.06, 0.15, 0.14]),
			];
		case "bandana":
			return [
				{ color, at: [0, 0.15, -0.01], size: [0.48, 0.08, 0.45] },
				{ color, at: [0, 0.13, -0.25], size: [0.1, 0.08, 0.06] },
				{ color, at: [0, 0.05, -0.255], size: [0.06, 0.12, 0.03] },
			];
	}
}
