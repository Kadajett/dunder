import {
	BROW_NAMES,
	EYE_NAMES,
	GLASSES_NAMES,
	HAIR_COLOR_NAMES,
	HAIR_NAMES,
	HEADWEAR_NAMES,
	MOUTH_NAMES,
	OUTFIT_NAMES,
	paletteName,
	SKIN_NAMES,
} from "./look-names";
import {
	type AvatarStyle,
	browStyles,
	eyeStyles,
	type GlassesStyle,
	glassesStyles,
	type HairStyle,
	type HeadwearStyle,
	hairColors,
	hairStyles,
	hatlessHairStyles,
	headwearStyles,
	mouthStyles,
	type OutfitPalette,
	type OutfitStyle,
	outfitPalettesFor,
	outfitStyles,
	skinTones,
} from "./style";

/** The parts Jeremy can pick for a new hire, in the picker's order. Pants and shoes stay seeded. */
export const LOOK_PARTS = [
	"hair",
	"hairColor",
	"skin",
	"eyes",
	"brows",
	"mouth",
	"outfit",
	"outfitColor",
	"glasses",
	"headwear",
] as const;
export type LookPart = (typeof LOOK_PARTS)[number];

/** A part's current option, as its row shows it: 'Pompadour', 19 of 20. */
export interface PartOption {
	readonly label: string;
	/** 1-based. */
	readonly position: number;
	readonly count: number;
}

/** A picked look, and what else the pick had to change (said for a moment), if anything. */
export interface LookStep {
	readonly style: AvatarStyle;
	readonly note: string | null;
}

interface PartList {
	readonly count: number;
	readonly index: number;
	label(index: number): string;
	apply(index: number): LookStep;
}

function listOf<T>(
	options: readonly T[],
	current: T,
	name: (option: T) => string,
	apply: (option: T) => LookStep | AvatarStyle,
): PartList {
	const entries = options.map((option) => ({ option, label: name(option) }));
	return {
		count: entries.length,
		index: Math.max(0, options.indexOf(current)),
		label: (index) => entries[index]?.label ?? "",
		apply: (index) => {
			const entry = entries[index];
			if (!entry) throw new Error(`no option ${index}`);
			const result = apply(entry.option);
			return "note" in result ? result : { style: result, note: null };
		},
	};
}

const isHatless = (hair: HairStyle): boolean => hatlessHairStyles.includes(hair);

/** The hat takes the outfit's accent rather than its main colour. */
function hatOnAccent(style: AvatarStyle): boolean {
	return (
		style.headwear?.color === style.outfit.accent && style.outfit.accent !== style.outfit.color
	);
}

function paletteIndex(style: AvatarStyle): number {
	const { color, accent } = style.outfit;
	const index = outfitPalettesFor(style.outfit.style).findIndex(
		(palette) => palette.color === color && palette.accent === accent,
	);
	return Math.max(0, index);
}

/** Dress in `palette`; a hat keeps matching the same side of it (colour or accent). */
function withPalette(style: AvatarStyle, outfit: OutfitStyle, palette: OutfitPalette): AvatarStyle {
	const dressed = {
		...style,
		outfit: { style: outfit, color: palette.color, accent: palette.accent },
	};
	if (!style.headwear) return dressed;
	const color = hatOnAccent(style) ? palette.accent : palette.color;
	return { ...dressed, headwear: { ...style.headwear, color } };
}

/** A new outfit style keeps the palette's place in the list when the new style has it. */
function withOutfit(style: AvatarStyle, outfit: OutfitStyle): AvatarStyle {
	const palettes = outfitPalettesFor(outfit);
	const palette = palettes[paletteIndex(style)] ?? palettes[0];
	if (!palette) throw new Error(`no palettes for ${outfit}`);
	return withPalette(style, outfit, palette);
}

function withoutHat(style: AvatarStyle): AvatarStyle {
	const { headwear: _gone, ...rest } = style;
	return rest;
}

/** A hatless haircut takes the hat off: the last pick wins. */
function withHair(style: AvatarStyle, hair: HairStyle): LookStep {
	const cut = { ...style, hair: { ...style.hair, style: hair } };
	if (!style.headwear || !isHatless(hair)) return { style: cut, note: null };
	return {
		style: withoutHat(cut),
		note: `No room for a hat with ${HAIR_NAMES[hair].toLowerCase()} hair: hat off`,
	};
}

/** The hat-friendly haircut closest to `hair` in the list (ahead first on a tie). */
export function nearestHatHair(hair: HairStyle): HairStyle {
	const from = hairStyles.indexOf(hair);
	for (let distance = 1; distance < hairStyles.length; distance += 1) {
		for (const index of [from + distance, from - distance]) {
			const candidate = hairStyles[index];
			if (candidate && !isHatless(candidate)) return candidate;
		}
	}
	return "short";
}

/** A hat on hatless hair steps the hair to the nearest cut that fits under it. */
function withHat(style: AvatarStyle, hat: HeadwearStyle | undefined): LookStep {
	if (!hat) return { style: withoutHat(style), note: null };
	const color = style.headwear && hatOnAccent(style) ? style.outfit.accent : style.outfit.color;
	const hatted = { ...style, headwear: { style: hat, color } };
	if (!isHatless(style.hair.style)) return { style: hatted, note: null };
	const hair = nearestHatHair(style.hair.style);
	return {
		style: { ...hatted, hair: { ...style.hair, style: hair } },
		note: `${HEADWEAR_NAMES[hat]} needs flatter hair: now ${HAIR_NAMES[hair].toLowerCase()}`,
	};
}

function withGlasses(style: AvatarStyle, glasses: GlassesStyle | undefined): AvatarStyle {
	const { glasses: _old, ...rest } = style;
	return glasses ? { ...rest, glasses } : rest;
}

const optional =
	<T extends string>(names: Readonly<Record<T, string>>) =>
	(option: T | undefined) =>
		option ? names[option] : "None";

/** Each part's options for a style, and what picking one does. */
const PART_LISTS: Readonly<Record<LookPart, (style: AvatarStyle) => PartList>> = {
	hair: (style) =>
		listOf(
			hairStyles,
			style.hair.style,
			(hair) => HAIR_NAMES[hair],
			(hair) => withHair(style, hair),
		),
	hairColor: (style) =>
		listOf(
			hairColors,
			style.hair.color,
			(color) => HAIR_COLOR_NAMES[color],
			(color) => ({ ...style, hair: { ...style.hair, color } }),
		),
	skin: (style) =>
		listOf(
			skinTones,
			style.skin,
			(skin) => SKIN_NAMES[skin],
			(skin) => ({ ...style, skin }),
		),
	eyes: (style) =>
		listOf(
			eyeStyles,
			style.eyes,
			(eyes) => EYE_NAMES[eyes],
			(eyes) => ({ ...style, eyes }),
		),
	brows: (style) =>
		listOf(
			browStyles,
			style.brows,
			(brows) => BROW_NAMES[brows],
			(brows) => ({ ...style, brows }),
		),
	mouth: (style) =>
		listOf(
			mouthStyles,
			style.mouth,
			(mouth) => MOUTH_NAMES[mouth],
			(mouth) => ({ ...style, mouth }),
		),
	outfit: (style) =>
		listOf(
			outfitStyles,
			style.outfit.style,
			(outfit) => OUTFIT_NAMES[outfit],
			(outfit) => withOutfit(style, outfit),
		),
	outfitColor: (style) => outfitColorList(style),
	glasses: (style) =>
		listOf([undefined, ...glassesStyles], style.glasses, optional(GLASSES_NAMES), (glasses) =>
			withGlasses(style, glasses),
		),
	headwear: (style) =>
		listOf([undefined, ...headwearStyles], style.headwear?.style, optional(HEADWEAR_NAMES), (hat) =>
			withHat(style, hat),
		),
};

function outfitColorList(style: AvatarStyle): PartList {
	const palettes = outfitPalettesFor(style.outfit.style);
	const indices = palettes.map((_, index) => index);
	return listOf(
		indices,
		paletteIndex(style),
		(index) => paletteName(palettes, index),
		(index) => {
			const palette = palettes[index] ?? palettes[0];
			return palette ? withPalette(style, style.outfit.style, palette) : style;
		},
	);
}

/** The option `part` shows for `style`. */
export function partOption(style: AvatarStyle, part: LookPart): PartOption {
	const list = PART_LISTS[part](style);
	return { label: list.label(list.index), position: list.index + 1, count: list.count };
}

/** `style` with `part` stepped to its next (1) or previous (-1) option, wrapping round. */
export function stepPart(style: AvatarStyle, part: LookPart, delta: 1 | -1): LookStep {
	const list = PART_LISTS[part](style);
	return list.apply((list.index + delta + list.count) % list.count);
}

/** Which side of the outfit the hat wears: its main colour or its accent. */
export function hatColorSide(style: AvatarStyle): "outfit" | "accent" | null {
	if (!style.headwear) return null;
	return hatOnAccent(style) ? "accent" : "outfit";
}

/** Switch the hat between the outfit's colour and its accent. */
export function toggleHatColor(style: AvatarStyle): AvatarStyle {
	if (!style.headwear) return style;
	const color = hatOnAccent(style) ? style.outfit.color : style.outfit.accent;
	return { ...style, headwear: { ...style.headwear, color } };
}
