import type { AvatarStyle, OutfitStyle } from "@shared/avatar/style";
import { type Cuboid, mirrored, type Vec3 } from "./Block";
import { TORSO } from "./rig";

type Outfit = AvatarStyle["outfit"];
type Point = [number, number];

const SHIRT_WHITE = "#f4f1ea";
const DARK_BUTTON = "#26221f";
const BRASS = "#e0b84a";

/* Torso-local space: the torso block spans x ±0.19, y ±0.2, z ±0.12 (chest on +z). */
const TOP = TORSO.height / 2;
/** Patches sit just proud of the chest. */
const CHEST = TORSO.depth / 2 + 0.006;
const PATCH = 0.012;

/** Garments worn over a shirt show the accent as the torso base colour. */
const SHIRT_UNDER: Record<OutfitStyle, boolean> = {
	tee: false,
	hoodie: false,
	suit: false,
	sweater: false,
	overalls: true,
	labCoat: false,
	polo: false,
	cardigan: true,
	jacket: false,
};

const SLEEVES: Record<OutfitStyle, { long: boolean; cuff: "accent" | "shirt" | null }> = {
	tee: { long: false, cuff: null },
	hoodie: { long: true, cuff: "accent" },
	suit: { long: true, cuff: "shirt" },
	sweater: { long: true, cuff: "accent" },
	overalls: { long: false, cuff: null },
	labCoat: { long: true, cuff: null },
	polo: { long: false, cuff: "accent" },
	cardigan: { long: true, cuff: null },
	jacket: { long: true, cuff: "accent" },
};

export interface Sleeve {
	readonly long: boolean;
	readonly color: string;
	readonly cuff: string | null;
}

/** How an outfit dresses the arms. */
export function sleeveFor(outfit: Outfit): Sleeve {
	const sleeve = SLEEVES[outfit.style];
	const cuff = sleeve.cuff === "shirt" ? SHIRT_WHITE : sleeve.cuff && outfit.accent;
	return {
		long: sleeve.long,
		color: SHIRT_UNDER[outfit.style] && !sleeve.long ? outfit.accent : outfit.color,
		cuff,
	};
}

/** Suits and overalls come with matching trousers. */
export function pantsColorFor(style: AvatarStyle): string {
	const matching = style.outfit.style === "suit" || style.outfit.style === "overalls";
	return matching ? style.outfit.color : style.pants;
}

/** A flat patch on the chest at `[x, y]`, `size` = width × height. */
const patch = (color: string, [x, y]: Point, [w, h]: Point, lift = 0): Cuboid => ({
	color,
	at: [x, y, CHEST + lift],
	size: [w, h, PATCH],
});

/** A band hugging the whole torso, `height` tall. */
const band = (color: string, y: number, height: number): Cuboid => ({
	color,
	at: [0, y, 0],
	size: [TORSO.width + 0.008, height, TORSO.depth + 0.008],
});

const collar = (color: string, size: Vec3 = [0.17, 0.03, 0.15]): Cuboid => ({
	color,
	at: [0, TOP + size[1] / 2 - 0.005, 0],
	size,
});

const buttons = (color: string, x: number, ys: readonly number[], lift = PATCH / 2): Cuboid[] =>
	ys.map((y) => patch(color, [x, y], [0.022, 0.022], lift));

/** Chest details per garment, over the base torso block. */
const DETAILS: Record<OutfitStyle, (outfit: Outfit) => Cuboid[]> = {
	tee: ({ color, accent }) => [
		collar(accent),
		patch(accent, [0.08, 0.06], [0.08, 0.08]),
		patch(color, [0.08, 0.06], [0.04, 0.04], PATCH / 2),
	],
	polo: ({ color, accent }) => [
		collar(color, [0.2, 0.035, 0.16]),
		...mirrored(accent, [0.045, TOP, 0.09], [0.07, 0.02, 0.07], [-0.5, 0, 0]),
		patch(accent, [0, 0.14], [0.03, 0.1]),
	],
	hoodie: ({ color, accent }) => [
		{ color, at: [0, TOP + 0.02, -0.09], size: [0.3, 0.1, 0.1] },
		patch(accent, [0.04, 0.12], [0.015, 0.12]),
		patch(accent, [-0.04, 0.12], [0.015, 0.12]),
		patch(accent, [0, -0.1], [0.22, 0.08]),
	],
	suit: ({ accent }) => [
		patch(SHIRT_WHITE, [0, 0.1], [0.1, 0.2]),
		patch(accent, [0, 0.18], [0.045, 0.035], PATCH / 2),
		patch(accent, [0, 0.07], [0.035, 0.16], PATCH / 2),
		...buttons(DARK_BUTTON, 0, [-0.06, -0.12]),
	],
	sweater: ({ accent }) => [collar(accent), band(accent, -0.02, 0.03), band(accent, 0.04, 0.03)],
	overalls: ({ color }) => [
		band(color, -0.13, 0.14),
		patch(color, [0, 0], [0.24, 0.16]),
		patch(color, [0.08, 0.13], [0.04, 0.14]),
		patch(color, [-0.08, 0.13], [0.04, 0.14]),
		...mirrored(color, [0.08, TOP + 0.004, 0], [0.04, 0.012, TORSO.depth + 0.004]),
		...buttons(BRASS, 0.08, [0.08]),
		...buttons(BRASS, -0.08, [0.08]),
	],
	labCoat: ({ color, accent }) => [
		patch(accent, [0, 0.13], [0.1, 0.14]),
		patch("#e2ddd2", [-0.08, 0.03], [0.07, 0.06]),
		patch(accent, [-0.06, 0.07], [0.012, 0.05], PATCH / 2),
		...buttons("#b9b4aa", 0, [-0.02, -0.09]),
		// Coat tails hang past the hips at the back and sides, open at the front.
		{ color, at: [0, -TOP - 0.08, -0.11], size: [TORSO.width + 0.01, 0.2, 0.03] },
		...mirrored(color, [TORSO.width / 2, -TOP - 0.08, 0], [0.03, 0.2, TORSO.depth]),
	],
	cardigan: ({ color, accent }) => [
		collar(accent),
		band(color, -0.005, TORSO.height - 0.01),
		patch(accent, [0, -0.005], [0.1, TORSO.height - 0.01], PATCH / 2),
		...buttons(SHIRT_WHITE, 0.065, [0.06, 0, -0.06], PATCH * 1.5),
	],
	jacket: ({ color, accent }) => [
		collar(color, [0.22, 0.06, 0.18]),
		patch(accent, [0, 0], [0.016, 0.36]),
		patch(accent, [0.09, -0.07], [0.07, 0.02]),
		patch(accent, [-0.09, -0.07], [0.07, 0.02]),
		band(accent, -0.18, 0.03),
	],
};

/** Clothed torso, centred on the torso pivot (upper-body local). */
export function outfitBlocks(outfit: Outfit): Cuboid[] {
	const base = SHIRT_UNDER[outfit.style] ? outfit.accent : outfit.color;
	return [
		{ color: base, at: [0, 0, 0], size: [TORSO.width, TORSO.height, TORSO.depth] },
		...DETAILS[outfit.style](outfit),
	];
}
