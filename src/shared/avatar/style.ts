/**
 * Mii-like avatar styles. An agent's look is derived deterministically from a
 * seed (its name / id), so the same agent always looks the same.
 */

export const skinTones = [
	"#fde3d0",
	"#f6d0b1",
	"#ecbc98",
	"#dba57f",
	"#c28b62",
	"#a06a47",
	"#7c4e34",
	"#5e3a27",
] as const;
export type SkinTone = (typeof skinTones)[number];

export const hairStyles = [
	"short",
	"spiky",
	"bob",
	"long",
	"ponytail",
	"bun",
	"afro",
	"buzz",
	"bald",
	"curly",
	"sidePart",
	"mohawk",
	"undercut",
	"sideSwept",
	"pigtails",
	"braids",
	"bowl",
	"flatTop",
	"pompadour",
	"twists",
] as const;
export type HairStyle = (typeof hairStyles)[number];

export const naturalHairColors = [
	"#221c18",
	"#3d2b20",
	"#654126",
	"#93592c",
	"#c99a55",
	"#e5c47f",
	"#b4482c",
	"#9a958e",
	"#e9e4da",
] as const;
export const funHairColors = ["#d9739b", "#4f7fb8", "#5fae8f", "#8a68b8"] as const;
export const hairColors = [...naturalHairColors, ...funHairColors] as const;
export type HairColor = (typeof hairColors)[number];

export const outfitStyles = [
	"tee",
	"hoodie",
	"suit",
	"sweater",
	"overalls",
	"labCoat",
	"polo",
	"cardigan",
	"jacket",
] as const;
export type OutfitStyle = (typeof outfitStyles)[number];

/** A garment colour with a harmonious accent (trim, tie, shirt underneath, stripes). */
export interface OutfitPalette {
	readonly color: string;
	readonly accent: string;
}

export const casualPalettes: readonly OutfitPalette[] = [
	{ color: "#4f7a6a", accent: "#ece0c6" },
	{ color: "#c4673f", accent: "#f2e4c9" },
	{ color: "#3f5a8a", accent: "#e8c36a" },
	{ color: "#8d5a97", accent: "#f0d6e4" },
	{ color: "#d6a443", accent: "#5a3e2b" },
	{ color: "#2f6f73", accent: "#f2a65e" },
	{ color: "#b3434b", accent: "#f2e6d0" },
	{ color: "#677f3c", accent: "#e8d9a8" },
	{ color: "#6c8fb3", accent: "#f5f1e8" },
	{ color: "#e07a5f", accent: "#3d405b" },
	{ color: "#7a6a9a", accent: "#f2cc8f" },
	{ color: "#3a3a46", accent: "#d95a4a" },
];
export const suitPalettes: readonly OutfitPalette[] = [
	{ color: "#2d3447", accent: "#b3434b" },
	{ color: "#3a3a3f", accent: "#4f7fb8" },
	{ color: "#5a4636", accent: "#d6a443" },
	{ color: "#6b6f78", accent: "#8d5a97" },
	{ color: "#1f2a2e", accent: "#2f6f73" },
];
/** Lab coats are always white; the accent is the shirt underneath. */
export const labCoatPalettes: readonly OutfitPalette[] = [
	{ color: "#f4f1ea", accent: "#6c8fb3" },
	{ color: "#f4f1ea", accent: "#b3434b" },
	{ color: "#f4f1ea", accent: "#677f3c" },
	{ color: "#f4f1ea", accent: "#d6a443" },
];

export function outfitPalettesFor(style: OutfitStyle): readonly OutfitPalette[] {
	if (style === "suit") return suitPalettes;
	if (style === "labCoat") return labCoatPalettes;
	return casualPalettes;
}

export const pantsColors = [
	"#3b4a63",
	"#2f2f35",
	"#6b5a45",
	"#c8b48a",
	"#4a5a3f",
	"#5c6470",
	"#7b3f3a",
] as const;
export const shoeColors = [
	"#2a2522",
	"#5a3a26",
	"#f2efe8",
	"#b3434b",
	"#3f5a8a",
	"#8a7a63",
] as const;

export const eyeStyles = ["dot", "oval", "sleepy", "wide"] as const;
export type EyeStyle = (typeof eyeStyles)[number];
export const browStyles = ["flat", "raised", "angled", "thick"] as const;
export type BrowStyle = (typeof browStyles)[number];
export const mouthStyles = ["smile", "grin", "flat", "open", "smirk"] as const;
export type MouthStyle = (typeof mouthStyles)[number];
export const glassesStyles = ["round", "square", "shades"] as const;
export type GlassesStyle = (typeof glassesStyles)[number];
export const headwearStyles = ["cap", "beanie", "headphones", "bandana"] as const;
export type HeadwearStyle = (typeof headwearStyles)[number];

/** Hairstyles too voluminous (or too shaped) to sit under a hat or headphones. */
export const hatlessHairStyles: readonly HairStyle[] = [
	"afro",
	"bun",
	"spiky",
	"mohawk",
	"curly",
	"bowl",
	"flatTop",
	"pompadour",
	"twists",
];

export interface AvatarStyle {
	skin: SkinTone;
	hair: { style: HairStyle; color: HairColor };
	outfit: { style: OutfitStyle; color: string; accent: string };
	pants: string;
	shoes: string;
	eyes: EyeStyle;
	brows: BrowStyle;
	mouth: MouthStyle;
	glasses?: GlassesStyle;
	/** Colour is the outfit colour or accent, so hats match clothes. */
	headwear?: { style: HeadwearStyle; color: string };
}

type Rng = () => number;

/** 32-bit FNV-1a hash of a string. */
export function hashSeed(seed: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** mulberry32: tiny deterministic PRNG returning floats in [0, 1). */
function mulberry32(initial: number): Rng {
	let state = initial;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(rng: Rng, items: readonly T[]): T {
	const item = items[Math.floor(rng() * items.length)];
	if (item === undefined) throw new Error("pick: empty palette");
	return item;
}

export function avatarStyleFor(seed: string): AvatarStyle {
	const rng = mulberry32(hashSeed(seed));
	const hairStyle = pick(rng, hairStyles);
	const outfitStyle = pick(rng, outfitStyles);
	const palette = pick(rng, outfitPalettesFor(outfitStyle));
	const style: AvatarStyle = {
		skin: pick(rng, skinTones),
		hair: {
			style: hairStyle,
			color: rng() < 0.82 ? pick(rng, naturalHairColors) : pick(rng, funHairColors),
		},
		outfit: { style: outfitStyle, color: palette.color, accent: palette.accent },
		pants: pick(rng, pantsColors),
		shoes: pick(rng, shoeColors),
		eyes: pick(rng, eyeStyles),
		brows: pick(rng, browStyles),
		mouth: pick(rng, mouthStyles),
	};
	const glassesRoll = rng();
	const glasses = pick(rng, glassesStyles);
	const headwearRoll = rng();
	const headwear = pick(rng, headwearStyles);
	const headwearColor = rng() < 0.5 ? palette.color : palette.accent;
	if (glassesRoll < 0.3) style.glasses = glasses;
	if (headwearRoll < 0.22 && !hatlessHairStyles.includes(hairStyle)) {
		style.headwear = { style: headwear, color: headwearColor };
	}
	return style;
}
