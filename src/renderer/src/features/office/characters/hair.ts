import type { HairStyle } from "@shared/avatar/style";
import type { Cuboid, Vec3 } from "./Block";

/** Hair is one colour, so styles are lists of [centre, size] in head space. */
type Shape = readonly [at: Vec3, size: Vec3];

const pair = (x: number, y: number, z: number, size: Vec3): Shape[] => [
	[[x, y, z], size],
	[[-x, y, z], size],
];

/* The head block spans x ±0.22, y ±0.2, z ±0.2 (face on +z). */
const TOP: Shape = [
	[0, 0.225, -0.01],
	[0.47, 0.07, 0.44],
];
const FRINGE: Shape = [
	[0, 0.165, 0.205],
	[0.47, 0.07, 0.03],
];
const BACK: Shape = [
	[0, 0.03, -0.215],
	[0.47, 0.32, 0.05],
];
const SIDES = pair(0.225, 0.1, -0.06, [0.03, 0.18, 0.32]);
const SHORT: Shape[] = [TOP, FRINGE, BACK, ...SIDES];

const BUZZ: Shape[] = [
	[
		[0, 0.21, 0],
		[0.45, 0.03, 0.41],
	],
	[
		[0, 0.185, 0.205],
		[0.45, 0.03, 0.02],
	],
	[
		[0, 0.07, -0.205],
		[0.45, 0.25, 0.02],
	],
	...pair(0.222, 0.12, -0.05, [0.015, 0.14, 0.3]),
];

/** Shoulder-length curtains; `drop` lowers their ends below the chin. */
function curtains(drop: number): Shape[] {
	const height = 0.42 + drop;
	const y = 0.2 - height / 2;
	return [
		TOP,
		FRINGE,
		[
			[0, y, -0.225],
			[0.5, height, 0.06],
		],
		...pair(0.245, y, 0, [0.05, height, 0.42]),
	];
}

const cube = (x: number, y: number, z: number, edge: number): Shape => [
	[x, y, z],
	[edge, edge, edge],
];

const SPIKES: Shape[] = [
	[-0.14, 0.3, 0.1, 0.12],
	[0, 0.32, 0.12, 0.15],
	[0.14, 0.3, 0.08, 0.12],
	[-0.1, 0.31, -0.08, 0.13],
	[0.08, 0.33, -0.04, 0.16],
	[-0.02, 0.29, -0.18, 0.11],
	[0.16, 0.29, -0.15, 0.11],
].map(
	([x = 0, y = 0, z = 0, height = 0]): Shape => [
		[x, y, z],
		[0.1, height, 0.1],
	],
);

const FIN: Shape[] = [
	...[0.14, 0.05, -0.04, -0.13].map(
		(z): Shape => [
			[0, 0.28, z],
			[0.09, 0.14, 0.1],
		],
	),
	[
		[0, 0.17, -0.23],
		[0.09, 0.16, 0.08],
	],
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

const HAIR: Record<HairStyle, readonly Shape[]> = {
	short: SHORT,
	buzz: BUZZ,
	bald: [
		[
			[0, 0, -0.207],
			[0.45, 0.12, 0.02],
		],
		// Runs back into the back panel rather than ending flush with the skull.
		...pair(0.223, 0.03, -0.075, [0.015, 0.1, 0.27]),
	],
	afro: [
		[
			[0, 0.27, -0.02],
			[0.58, 0.22, 0.52],
		],
		[
			[0, 0.05, -0.24],
			[0.58, 0.36, 0.1],
		],
		...pair(0.26, 0.06, -0.06, [0.1, 0.3, 0.4]),
	],
	bob: curtains(0),
	long: curtains(0.18),
	spiky: [...SHORT, ...SPIKES],
	mohawk: [...BUZZ, ...FIN],
	curly: [...BUZZ, ...CURLS],
	bun: [
		...SHORT,
		[
			[0, 0.33, -0.08],
			[0.18, 0.16, 0.18],
		],
	],
	ponytail: [
		...SHORT,
		cube(0, 0.08, -0.25, 0.09),
		[
			[0, -0.1, -0.27],
			[0.11, 0.28, 0.08],
		],
	],
	sidePart: [
		...SHORT,
		[
			[0.05, 0.275, 0.06],
			[0.34, 0.05, 0.3],
		],
		[
			[-0.08, 0.15, 0.215],
			[0.25, 0.08, 0.03],
		],
	],
};

/** Hairstyle in head space. Volume sits on the crown and front so it reads from above. */
export function hairBlocks(style: HairStyle, color: string): Cuboid[] {
	return HAIR[style].map(([at, size]) => ({ color, at, size }));
}
