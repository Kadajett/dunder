import { describe, expect, it } from "vitest";
import {
	hatColorSide,
	LOOK_PARTS,
	nearestHatHair,
	partOption,
	stepPart,
	toggleHatColor,
} from "./look";
import {
	type AvatarStyle,
	casualPalettes,
	hatlessHairStyles,
	labCoatPalettes,
	suitPalettes,
} from "./style";

const base: AvatarStyle = {
	skin: "#ecbc98",
	hair: { style: "short", color: "#221c18" },
	outfit: { style: "tee", color: "#c4673f", accent: "#f2e4c9" },
	pants: "#3b4a63",
	shoes: "#2a2522",
	eyes: "dot",
	brows: "flat",
	mouth: "smile",
};

const hatted: AvatarStyle = { ...base, headwear: { style: "beanie", color: base.outfit.accent } };

describe("look picker rules", () => {
	it("walks every part through all its options and back round to the start", () => {
		for (const part of LOOK_PARTS) {
			const { count } = partOption(base, part);
			let style = base;
			const seen = new Set<string>();
			for (let i = 0; i < count; i += 1) {
				seen.add(partOption(style, part).label);
				style = stepPart(style, part, 1).style;
			}
			expect(seen.size, part).toBe(count);
			expect(partOption(style, part), part).toEqual(partOption(base, part));
			expect(stepPart(stepPart(base, part, 1).style, part, -1).style, part).toEqual(base);
		}
	});

	it("shows the option's name and place: 'Short 1/20', glasses 'None 1/4'", () => {
		expect(partOption(base, "hair")).toEqual({ label: "Short", position: 1, count: 20 });
		expect(partOption(base, "glasses")).toEqual({ label: "None", position: 1, count: 4 });
		expect(partOption(base, "outfitColor")).toEqual({
			label: "Rust",
			position: 2,
			count: casualPalettes.length,
		});
	});

	it("keeps the palette's place when the new outfit has it, else takes the first", () => {
		// tee → hoodie: casual to casual, palette 2 stays.
		const hoodie = stepPart(base, "outfit", 1).style;
		expect(hoodie.outfit).toEqual({ style: "hoodie", ...casualPalettes[1] });
		// hoodie → suit: suits have a second palette too.
		const suit = stepPart(hoodie, "outfit", 1).style;
		expect(suit.outfit).toEqual({ style: "suit", ...suitPalettes[1] });
		// Casual palette 11 has no lab-coat counterpart: overalls → lab coat takes the first.
		const late: AvatarStyle = {
			...base,
			outfit: { style: "overalls", color: "#7a6a9a", accent: "#f2cc8f" },
		};
		expect(partOption(late, "outfitColor").position).toBe(11);
		const fromLate = stepPart(late, "outfit", 1).style;
		expect(fromLate.outfit).toEqual({ style: "labCoat", ...labCoatPalettes[0] });
	});

	it("keeps a hat on the same side of the outfit's colours when the outfit changes", () => {
		const recoloured = stepPart(hatted, "outfitColor", 1).style;
		expect(recoloured.headwear?.color).toBe(recoloured.outfit.accent);
		const plain = toggleHatColor(hatted);
		expect(hatColorSide(plain)).toBe("outfit");
		const suit = stepPart(stepPart(plain, "outfit", 1).style, "outfit", 1).style;
		expect(suit.headwear?.color).toBe(suit.outfit.color);
	});

	it("takes the hat off for a hatless haircut, and says so", () => {
		const step = stepPart({ ...hatted, hair: { ...hatted.hair, style: "ponytail" } }, "hair", 1);
		expect(step.style.hair.style).toBe("bun");
		expect(step.style.headwear).toBeUndefined();
		expect("headwear" in step.style).toBe(false);
		expect(step.note).toMatch(/hat/i);
		// No hat on: nothing to say.
		expect(
			stepPart({ ...base, hair: { ...base.hair, style: "ponytail" } }, "hair", 1).note,
		).toBeNull();
	});

	it("steps hatless hair to the nearest hat-friendly cut when a hat goes on, and says so", () => {
		const afro: AvatarStyle = { ...base, hair: { ...base.hair, style: "afro" } };
		const step = stepPart(afro, "headwear", 1);
		expect(step.style.headwear).toEqual({ style: "cap", color: base.outfit.color });
		expect(step.style.hair.style).toBe("buzz");
		expect(step.note).toMatch(/hair/i);
		for (const hair of hatlessHairStyles)
			expect(hatlessHairStyles).not.toContain(nearestHatHair(hair));
	});

	it("never combines hatless hair and a hat, whatever the order of picks", () => {
		let style = hatted;
		const parts = ["hair", "headwear", "hair", "hair", "headwear", "hair", "headwear"] as const;
		for (let round = 0; round < 60; round += 1) {
			style = stepPart(
				style,
				parts[round % parts.length] ?? "hair",
				round % 3 === 0 ? -1 : 1,
			).style;
			if (style.headwear) expect(hatlessHairStyles).not.toContain(style.hair.style);
		}
	});
});
