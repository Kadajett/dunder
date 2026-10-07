import {
	type BrowStyle,
	casualPalettes,
	type EyeStyle,
	type GlassesStyle,
	type HairColor,
	type HairStyle,
	type HeadwearStyle,
	labCoatPalettes,
	type MouthStyle,
	type OutfitPalette,
	type OutfitStyle,
	type SkinTone,
	suitPalettes,
} from "./style";

/** What the hire dialog's look picker calls each option. */
export const HAIR_NAMES: Readonly<Record<HairStyle, string>> = {
	short: "Short",
	spiky: "Spiky",
	bob: "Bob",
	long: "Long",
	ponytail: "Ponytail",
	bun: "Bun",
	afro: "Afro",
	buzz: "Buzz cut",
	bald: "Bald",
	curly: "Curly",
	sidePart: "Side part",
	mohawk: "Mohawk",
	undercut: "Undercut",
	sideSwept: "Side swept",
	pigtails: "Pigtails",
	braids: "Braids",
	bowl: "Bowl cut",
	flatTop: "Flat top",
	pompadour: "Pompadour",
	twists: "Twists",
};

export const HAIR_COLOR_NAMES: Readonly<Record<HairColor, string>> = {
	"#221c18": "Black",
	"#3d2b20": "Dark brown",
	"#654126": "Brown",
	"#93592c": "Chestnut",
	"#c99a55": "Dark blond",
	"#e5c47f": "Blond",
	"#b4482c": "Red",
	"#9a958e": "Grey",
	"#e9e4da": "White",
	"#d9739b": "Pink",
	"#4f7fb8": "Blue",
	"#5fae8f": "Mint",
	"#8a68b8": "Violet",
};

export const SKIN_NAMES: Readonly<Record<SkinTone, string>> = {
	"#fde3d0": "Porcelain",
	"#f6d0b1": "Fair",
	"#ecbc98": "Light",
	"#dba57f": "Medium",
	"#c28b62": "Tan",
	"#a06a47": "Brown",
	"#7c4e34": "Dark",
	"#5e3a27": "Deep",
};

export const EYE_NAMES: Readonly<Record<EyeStyle, string>> = {
	dot: "Dots",
	oval: "Ovals",
	sleepy: "Sleepy",
	wide: "Wide",
};

export const BROW_NAMES: Readonly<Record<BrowStyle, string>> = {
	flat: "Flat",
	raised: "Raised",
	angled: "Angled",
	thick: "Thick",
};

export const MOUTH_NAMES: Readonly<Record<MouthStyle, string>> = {
	smile: "Smile",
	grin: "Grin",
	flat: "Flat",
	open: "Open",
	smirk: "Smirk",
};

export const OUTFIT_NAMES: Readonly<Record<OutfitStyle, string>> = {
	tee: "T-shirt",
	hoodie: "Hoodie",
	suit: "Suit",
	sweater: "Sweater",
	overalls: "Overalls",
	labCoat: "Lab coat",
	polo: "Polo",
	cardigan: "Cardigan",
	jacket: "Jacket",
};

export const GLASSES_NAMES: Readonly<Record<GlassesStyle, string>> = {
	round: "Round",
	square: "Square",
	shades: "Shades",
};

export const HEADWEAR_NAMES: Readonly<Record<HeadwearStyle, string>> = {
	cap: "Cap",
	beanie: "Beanie",
	headphones: "Headphones",
	bandana: "Bandana",
};

/** Palette names, in each palette list's order. */
const PALETTE_NAMES = new Map<readonly OutfitPalette[], readonly string[]>([
	[
		casualPalettes,
		[
			"Sage",
			"Rust",
			"Navy & gold",
			"Plum",
			"Mustard",
			"Teal",
			"Brick",
			"Olive",
			"Sky",
			"Coral",
			"Lavender",
			"Charcoal & red",
		],
	],
	[suitPalettes, ["Navy", "Charcoal", "Brown", "Grey", "Black"]],
	[labCoatPalettes, ["Blue shirt", "Red shirt", "Green shirt", "Gold shirt"]],
]);

/** The name of palette `index` in `palettes`. */
export function paletteName(palettes: readonly OutfitPalette[], index: number): string {
	return PALETTE_NAMES.get(palettes)?.[index] ?? `Colour ${index + 1}`;
}
