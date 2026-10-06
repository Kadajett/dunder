import { describe, expect, it } from "vitest";
import {
	avatarStyleFor,
	browStyles,
	eyeStyles,
	glassesStyles,
	hairColors,
	hairStyles,
	hatlessHairStyles,
	headwearStyles,
	mouthStyles,
	outfitPalettesFor,
	outfitStyles,
	pantsColors,
	shoeColors,
	skinTones,
} from "./style";

const names = Array.from({ length: 40 }, (_, i) =>
	["ava", "ben", "emma", "finn", "jonas", "leo", "max", "nora"].map((n) => `${n}-${i}`),
)
	.flat()
	.slice(0, 40);

describe("avatarStyleFor", () => {
	it("is deterministic for a seed", () => {
		expect(avatarStyleFor("claude-7")).toEqual(avatarStyleFor("claude-7"));
	});

	it("varies hairstyles, outfits and skin tones across 40 names", () => {
		const styles = names.map(avatarStyleFor);
		expect(new Set(styles.map((s) => s.hair.style)).size).toBeGreaterThanOrEqual(7);
		expect(new Set(styles.map((s) => s.outfit.style)).size).toBeGreaterThanOrEqual(6);
		expect(new Set(styles.map((s) => s.skin)).size).toBeGreaterThanOrEqual(4);
		expect(new Set(styles.map((s) => JSON.stringify(s))).size).toBe(40);
	});

	it("only draws values from the curated palettes", () => {
		for (const name of names) {
			const s = avatarStyleFor(name);
			expect(skinTones).toContain(s.skin);
			expect(hairStyles).toContain(s.hair.style);
			expect(hairColors).toContain(s.hair.color);
			expect(outfitStyles).toContain(s.outfit.style);
			expect(outfitPalettesFor(s.outfit.style)).toContainEqual({
				color: s.outfit.color,
				accent: s.outfit.accent,
			});
			expect(pantsColors).toContain(s.pants);
			expect(shoeColors).toContain(s.shoes);
			expect(eyeStyles).toContain(s.eyes);
			expect(browStyles).toContain(s.brows);
			expect(mouthStyles).toContain(s.mouth);
			if (s.glasses !== undefined) expect(glassesStyles).toContain(s.glasses);
			if (s.headwear !== undefined) {
				expect(headwearStyles).toContain(s.headwear.style);
				expect([s.outfit.color, s.outfit.accent]).toContain(s.headwear.color);
				expect(hatlessHairStyles).not.toContain(s.hair.style);
			}
		}
	});
});
