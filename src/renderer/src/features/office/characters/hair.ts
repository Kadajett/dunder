import type { HairStyle } from "@shared/avatar/style";
import type { Cuboid, Vec3 } from "./Block";

/** Hair is one colour, so styles are lists of [centre, size] in head space. */
type Shape = readonly [at: Vec3, size: Vec3];

const pair = (x: number, y: number, z: number, size: Vec3): Shape[] => [
	[[x, y, z], size],
	[[-x, y, z], size],
];

const box = (x: number, y: number, z: number, size: Vec3): Shape => [[x, y, z], size];

const cube = (x: number, y: number, z: number, edge: number): Shape => [
	[x, y, z],
	[edge, edge, edge],
];

/* The head block spans x ±0.22, y ±0.2, z ±0.2 (face on +z). */
const TOP = box(0, 0.225, -0.01, [0.47, 0.07, 0.44]);
const FRINGE = box(0, 0.165, 0.205, [0.47, 0.07, 0.03]);
const BACK = box(0, 0.03, -0.215, [0.47, 0.32, 0.05]);
const SIDES = pair(0.225, 0.1, -0.06, [0.03, 0.18, 0.32]);
const SHORT: Shape[] = [TOP, FRINGE, BACK, ...SIDES];
/** The short cut without its fringe, for styles that sweep their own. */
const SHORT_OPEN: Shape[] = [TOP, BACK, ...SIDES];

const BUZZ: Shape[] = [
	box(0, 0.21, 0, [0.45, 0.03, 0.41]),
	box(0, 0.185, 0.205, [0.45, 0.03, 0.02]),
	box(0, 0.07, -0.205, [0.45, 0.25, 0.02]),
	...pair(0.222, 0.12, -0.05, [0.015, 0.14, 0.3]),
];

/** Shoulder-length curtains; `drop` lowers their ends below the chin. */
function curtains(drop: number): Shape[] {
	const height = 0.42 + drop;
	const y = 0.2 - height / 2;
	return [
		TOP,
		FRINGE,
		box(0, y, -0.225, [0.5, height, 0.06]),
		...pair(0.245, y, 0, [0.05, height, 0.42]),
	];
}

const SPIKES: Shape[] = [
	[-0.14, 0.3, 0.1, 0.12],
	[0, 0.32, 0.12, 0.15],
	[0.14, 0.3, 0.08, 0.12],
	[-0.1, 0.31, -0.08, 0.13],
	[0.08, 0.33, -0.04, 0.16],
	[-0.02, 0.29, -0.18, 0.11],
	[0.16, 0.29, -0.15, 0.11],
].map(([x = 0, y = 0, z = 0, height = 0]) => box(x, y, z, [0.1, height, 0.1]));

const FIN: Shape[] = [
	...[0.14, 0.05, -0.04, -0.13].map((z) => box(0, 0.28, z, [0.09, 0.14, 0.1])),
	box(0, 0.17, -0.23, [0.09, 0.16, 0.08]),
];

const CURLS: Shape[] = [
	...[-0.15, 0, 0.15].flatMap((x, i) =>
		[-0.15, 0, 0.15].map((z, j) => cube(x, 0.25 + ((i + j) % 2) * 0.02, z, 0.13)),
	),
	cube(0.12, 0.05, -0.23, 0.12),
	cube(-0.12, 0.05, -0.23, 0.12),
	cube(0, -0.05, -0.23, 0.12),
	cube(0.12, 0.19, 0.2, 0.1),
	cube(-0.12, 0.19, 0.2, 0.1),
	cube(0, 0.2, 0.21, 0.1),
];

/** Shaved sides, a thick slab on top and a fringe swept down to one side. */
const UNDERCUT: Shape[] = [
	...BUZZ,
	box(0, 0.255, -0.01, [0.36, 0.08, 0.4]),
	// Its bottom (0.14) stays clear of a beanie brim's (0.145).
	box(0.06, 0.2, 0.2, [0.24, 0.12, 0.045]),
	box(0.15, 0.13, 0.2, [0.08, 0.06, 0.04]),
];

/** A fringe stepping down across the forehead and one side grown to the jaw. */
const SIDE_SWEPT: Shape[] = [
	...SHORT_OPEN,
	...[
		// The outer step overhangs the skull's side (x 0.22) rather than ending flush with it.
		[-0.16, 0.15],
		[-0.03, 0.12],
		[0.1, 0.09],
	].map(([x = 0, bottom = 0]) => box(x, (bottom + 0.2) / 2, 0.205, [0.13, 0.2 - bottom, 0.03])),
	box(0.245, 0.03, 0, [0.05, 0.34, 0.42]),
];

/** A bunch on each side, tied just above the ears, far enough forward to read from the front. */
const PIGTAILS: Shape[] = [
	...SHORT,
	...pair(0.27, 0.08, -0.03, [0.06, 0.06, 0.06]),
	...pair(0.31, -0.03, -0.03, [0.09, 0.2, 0.09]),
];

/**
 * Two plaits beside the jaw, alternating thick and thin with a tie at the end;
 * they stop just above the shoulders so swinging arms never cut through them.
 */
const BRAIDS: Shape[] = [
	...SHORT,
	...[
		[0.03, 0.1],
		[-0.06, 0.085],
		// Hangs past the jaw (y -0.2) instead of ending level with it.
		[-0.155, 0.1],
		[-0.23, 0.06],
	].flatMap(([y = 0, edge = 0]) => pair(0.255, y, 0, [edge, edge, edge])),
];

/** A wide helmet with a straight fringe down to the brows. */
const BOWL: Shape[] = [
	box(0, 0.24, 0, [0.49, 0.1, 0.47]),
	box(0, 0.125, 0.215, [0.49, 0.13, 0.04]),
	...pair(0.235, 0.085, -0.02, [0.03, 0.21, 0.43]),
	box(0, 0.06, -0.21, [0.49, 0.26, 0.05]),
];

/** Shaved sides under a tall, square block. */
const FLAT_TOP: Shape[] = [...BUZZ, box(0, 0.285, -0.01, [0.4, 0.17, 0.36])];

/** Shaved sides under a quiff that rolls up and forward over the forehead. */
const POMPADOUR: Shape[] = [
	...BUZZ,
	box(0, 0.255, -0.02, [0.38, 0.08, 0.36]),
	box(0, 0.31, 0.12, [0.34, 0.1, 0.18]),
	box(0, 0.33, 0.23, [0.3, 0.08, 0.08]),
];

/** Tall, thin twists packed in rows across the crown (taller than curls), a few hanging at the nape. */
const TWISTS: Shape[] = [
	...BUZZ,
	...[-0.18, -0.09, 0, 0.09, 0.18].flatMap((x, i) =>
		[-0.15, -0.05, 0.05, 0.15].map((z, j) => {
			const height = [0.14, 0.18, 0.16][(i + j) % 3] ?? 0.14;
			return box(x, 0.215 + height / 2, z, [0.065, height, 0.065]);
		}),
	),
	...[-0.15, -0.05, 0.05, 0.15].map((x) => box(x, 0.0, -0.225, [0.065, 0.2, 0.04])),
];

interface HairCut {
	readonly shapes: readonly Shape[];
	/** Top of a smooth crown, where a raised streak can run front to back. */
	readonly crown?: number;
	/** A straight fringe's bottom edge and front face, where a tuft can hang. */
	readonly fringe?: { readonly bottom: number; readonly front: number };
}

const SHORT_FRINGE = { bottom: 0.13, front: 0.22 } as const;
const SHORT_CROWN = 0.26;

const HAIR: Record<HairStyle, HairCut> = {
	short: { shapes: SHORT, crown: SHORT_CROWN, fringe: SHORT_FRINGE },
	buzz: { shapes: BUZZ, crown: 0.225 },
	bald: {
		shapes: [
			box(0, 0, -0.207, [0.45, 0.12, 0.02]),
			// Runs back into the back panel rather than ending flush with the skull.
			...pair(0.223, 0.03, -0.075, [0.015, 0.1, 0.27]),
		],
	},
	afro: {
		shapes: [
			box(0, 0.27, -0.02, [0.58, 0.22, 0.52]),
			box(0, 0.05, -0.24, [0.58, 0.36, 0.1]),
			...pair(0.26, 0.06, -0.06, [0.1, 0.3, 0.4]),
		],
	},
	bob: { shapes: curtains(0), crown: SHORT_CROWN, fringe: SHORT_FRINGE },
	long: { shapes: curtains(0.18), crown: SHORT_CROWN, fringe: SHORT_FRINGE },
	spiky: { shapes: [...SHORT, ...SPIKES] },
	mohawk: { shapes: [...BUZZ, ...FIN] },
	curly: { shapes: [...BUZZ, ...CURLS] },
	bun: {
		shapes: [...SHORT, box(0, 0.33, -0.08, [0.18, 0.16, 0.18])],
		crown: SHORT_CROWN,
		fringe: SHORT_FRINGE,
	},
	ponytail: {
		shapes: [...SHORT, cube(0, 0.08, -0.25, 0.09), box(0, -0.1, -0.27, [0.11, 0.28, 0.08])],
		crown: SHORT_CROWN,
		fringe: SHORT_FRINGE,
	},
	sidePart: {
		shapes: [
			...SHORT,
			box(0.05, 0.275, 0.06, [0.34, 0.05, 0.3]),
			box(-0.08, 0.15, 0.215, [0.25, 0.08, 0.03]),
		],
		crown: SHORT_CROWN,
	},
	undercut: { shapes: UNDERCUT, crown: 0.295 },
	sideSwept: { shapes: SIDE_SWEPT, crown: SHORT_CROWN },
	pigtails: { shapes: PIGTAILS, crown: SHORT_CROWN, fringe: SHORT_FRINGE },
	braids: { shapes: BRAIDS, crown: SHORT_CROWN, fringe: SHORT_FRINGE },
	bowl: { shapes: BOWL, crown: 0.29 },
	flatTop: { shapes: FLAT_TOP },
	pompadour: { shapes: POMPADOUR },
	twists: { shapes: TWISTS },
};

/**
 * Small per-character touches on top of a style, so two people with the same
 * cut still differ: which side it parts to, a raised streak along the crown,
 * and a tuft hanging from the fringe. Styles without a smooth crown or a
 * straight fringe skip the touches they have no place for.
 */
export interface HairVariant {
	/** Mirror the cut left to right (part side, sweep direction). */
	readonly mirror: boolean;
	/** x of a raised streak along the crown, if any. */
	readonly streak: number | null;
	/** x of a tuft hanging below the fringe, if any. */
	readonly tuft: number | null;
}

const STREAKS = [null, -0.1, 0.1] as const;
const TUFTS = [null, -0.13, -0.05, 0.05, 0.13] as const;

/** Every combination, so tests can hold each one to the head's invariants. */
export const HAIR_VARIANTS: readonly HairVariant[] = [false, true].flatMap((mirror) =>
	STREAKS.flatMap((streak) => TUFTS.map((tuft) => ({ mirror, streak, tuft }))),
);

export const PLAIN_HAIR: HairVariant = { mirror: false, streak: null, tuft: null };

/** A stable variant for a seed (e.g. a hash of the whole avatar style). */
export function hairVariantFor(seed: number): HairVariant {
	return HAIR_VARIANTS[seed % HAIR_VARIANTS.length] ?? PLAIN_HAIR;
}

function touches(cut: HairCut, variant: HairVariant): Shape[] {
	const shapes: Shape[] = [];
	if (cut.crown !== undefined && variant.streak !== null) {
		// Sunk into the crown and standing proud of it, so it reads as a ridge, never a flush face.
		shapes.push(box(variant.streak, cut.crown + 0.004, -0.02, [0.06, 0.016, 0.34]));
	}
	if (cut.fringe !== undefined && variant.tuft !== null) {
		const { bottom, front } = cut.fringe;
		shapes.push(box(variant.tuft, bottom - 0.015, front - 0.015, [0.07, 0.05, 0.03]));
	}
	return shapes;
}

/** Hairstyle in head space. Volume sits on the crown and front so it reads from above. */
export function hairBlocks(style: HairStyle, color: string, variant = PLAIN_HAIR): Cuboid[] {
	const cut = HAIR[style];
	return [...cut.shapes, ...touches(cut, variant)].map(([[x, y, z], size]) => ({
		color,
		at: [variant.mirror ? -x : x, y, z],
		size,
	}));
}
