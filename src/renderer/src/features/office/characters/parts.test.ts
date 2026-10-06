import {
	type AvatarStyle,
	avatarStyleFor,
	browStyles,
	eyeStyles,
	glassesStyles,
	hairStyles,
	hatlessHairStyles,
	headwearStyles,
	mouthStyles,
	outfitPalettesFor,
	outfitStyles,
} from "@shared/avatar/style";
import { describe, expect, it } from "vitest";
import type { Cuboid } from "./Block";
import { HAIR_VARIANTS } from "./hair";
import { armPart, facePart, headPart, upperPart } from "./parts";

/** Faces of two colours closer than this, facing the same way, can z-fight. */
const MIN_GAP = 0.002;
/** Overlaps thinner than this are edges touching, not shared area. */
const MIN_OVERLAP = 1e-4;

type Range = readonly [number, number];

interface Face {
	readonly axis: 0 | 1 | 2;
	readonly sign: 1 | -1;
	readonly plane: number;
	/** Extent along the two other axes. */
	readonly span: readonly [Range, Range];
}

/** The other two axes of each axis, in a fixed order. */
const ACROSS = [
	[1, 2],
	[0, 2],
	[0, 1],
] as const;

type Axis = 0 | 1 | 2;

const extent = ({ at, size }: Cuboid, axis: Axis): Range => [
	at[axis] - size[axis] / 2,
	at[axis] + size[axis] / 2,
];

function facesOf(block: Cuboid): Face[] {
	return ([0, 1, 2] as const).flatMap((axis) => {
		const [u, v] = ACROSS[axis];
		const span = [extent(block, u), extent(block, v)] as const;
		const [low, high] = extent(block, axis);
		return [
			{ axis, sign: 1, plane: high, span },
			{ axis, sign: -1, plane: low, span },
		] as const;
	});
}

function intersect(a: Range, b: Range): Range | null {
	const low = Math.max(a[0], b[0]);
	const high = Math.min(a[1], b[1]);
	return high - low > MIN_OVERLAP ? [low, high] : null;
}

const covers = (outer: Range, inner: Range): boolean =>
	outer[0] <= inner[0] + MIN_OVERLAP && outer[1] >= inner[1] - MIN_OVERLAP;

/** Where two same-facing faces closer than `MIN_GAP` overlap, if they do. */
function sharedPatch(a: Face, b: Face): readonly [Range, Range] | null {
	if (a.axis !== b.axis || a.sign !== b.sign || Math.abs(a.plane - b.plane) >= MIN_GAP) return null;
	const u = intersect(a.span[0], b.span[0]);
	const v = intersect(a.span[1], b.span[1]);
	return u && v ? [u, v] : null;
}

/**
 * Whether some block fills the space just in front of the patch, so neither
 * face can be seen there (inside another block, or pressed against one).
 */
function buried(patch: readonly [Range, Range], face: Face, blocks: readonly Cuboid[]): boolean {
	const [u, v] = ACROSS[face.axis];
	const ahead = face.plane + face.sign * 2 * MIN_GAP;
	const front: Range = [Math.min(face.plane, ahead), Math.max(face.plane, ahead)];
	return blocks.some(
		(block) =>
			covers(extent(block, face.axis), front) &&
			covers(extent(block, u), patch[0]) &&
			covers(extent(block, v), patch[1]),
	);
}

const blockName = ({ color, at }: Cuboid): string =>
	`${color}@${at.map((value) => value.toFixed(3)).join(",")}`;

function clashes(a: Cuboid, b: Cuboid, blocks: readonly Cuboid[]): string[] {
	const other = facesOf(b);
	return facesOf(a).flatMap((face, k) => {
		const twin = other[k];
		const patch = twin && sharedPatch(face, twin);
		if (!patch || buried(patch, face, blocks)) return [];
		return [
			`${blockName(a)} vs ${blockName(b)} on ${face.sign > 0 ? "+" : "-"}${"xyz"[face.axis]}`,
		];
	});
}

/**
 * Visible same-facing faces of two colours closer than `MIN_GAP`: they z-fight.
 * Rotated blocks are skipped (they can't sit flush with axis-aligned ones).
 */
function flushFaces(blocks: readonly Cuboid[]): string[] {
	const aligned = blocks.filter((block) => !block.rotation?.some((angle) => angle !== 0));
	return aligned.flatMap((a, i) =>
		aligned.slice(i + 1).flatMap((b) => (a.color === b.color ? [] : clashes(a, b, aligned))),
	);
}

const base = avatarStyleFor("parts-test");

const outfits = outfitStyles.flatMap((style) =>
	outfitPalettesFor(style).map(
		(palette): AvatarStyle => ({ ...base, outfit: { style, ...palette } }),
	),
);

/** Each hairstyle under each headwear it may wear; glasses and hair variants are swept inside. */
const heads = hairStyles.flatMap((hair) => {
	const hats = hatlessHairStyles.includes(hair) ? [undefined] : [undefined, ...headwearStyles];
	return hats.map((hat): AvatarStyle => {
		const style: AvatarStyle = { ...base, hair: { ...base.hair, style: hair } };
		delete style.glasses;
		delete style.headwear;
		if (hat) style.headwear = { style: hat, color: base.outfit.color };
		return style;
	});
});

const faces = eyeStyles.flatMap((eyes) =>
	browStyles.flatMap((brows) =>
		mouthStyles.flatMap((mouth) =>
			[undefined, ...glassesStyles].map((glasses): AvatarStyle => {
				const style: AvatarStyle = { ...base, eyes, brows, mouth };
				delete style.glasses;
				if (glasses) style.glasses = glasses;
				return style;
			}),
		),
	),
);

const outfitCases = outfits.map(
	(style) => [`${style.outfit.style} ${style.outfit.color}/${style.outfit.accent}`, style] as const,
);

const faceCases = faces.map((style) => {
	const { glasses, eyes, brows, mouth } = style;
	return [[`${eyes}/${brows}/${mouth}`, glasses].filter(Boolean).join(" "), style] as const;
});

const headCases = heads.map(
	(style) => [[style.hair.style, style.headwear?.style ?? "no hat"].join(" "), style] as const,
);

describe("character parts leave depth room between colours", () => {
	it.each(outfitCases)("%s arms", (_, style) => {
		expect(flushFaces(armPart(style))).toEqual([]);
	});

	it.each(outfitCases)("%s torso and neck", (_, style) => {
		expect(flushFaces(upperPart(style))).toEqual([]);
	});

	it.each(faceCases)("%s face", (_, style) => {
		expect(flushFaces([...headPart(style), ...facePart(style)])).toEqual([]);
	});

	it.each(headCases)("%s hair, every variant and glasses", (_, style) => {
		const clashes = HAIR_VARIANTS.flatMap((variant) =>
			[undefined, ...glassesStyles].flatMap((glasses) => {
				const worn: AvatarStyle = glasses ? { ...style, glasses } : style;
				const found = flushFaces([...headPart(worn, variant), ...facePart(worn)]);
				return found.map((clash) => `${JSON.stringify(variant)} ${glasses ?? ""}: ${clash}`);
			}),
		);
		expect(clashes).toEqual([]);
	});
});
