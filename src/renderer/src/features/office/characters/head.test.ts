import { hairStyles, hatlessHairStyles, headwearStyles } from "@shared/avatar/style";
import { describe, expect, it } from "vitest";
import { headwearBlocks } from "./accessories";
import type { Cuboid } from "./Block";
import { EYE, FACE_Z } from "./face";
import { hairBlocks } from "./hair";

/** The largest eye footprint any eye style draws, around each eye centre. */
const EYE_HALF = { x: 0.045, y: 0.045 };

function coversAnEye(block: Cuboid): boolean {
	const [x, y, z] = block.at;
	const [w, h, d] = block.size;
	if (z + d / 2 <= FACE_Z) return false;
	const overlapsY = Math.abs(y - EYE.y) < h / 2 + EYE_HALF.y;
	const overlapsX = [EYE.x, -EYE.x].some((eyeX) => Math.abs(x - eyeX) < w / 2 + EYE_HALF.x);
	return overlapsX && overlapsY;
}

describe("voxel head", () => {
	it.each(hairStyles)("%s hair leaves both eyes visible", (style) => {
		expect(hairBlocks(style, "#000").filter(coversAnEye)).toEqual([]);
	});

	it.each(headwearStyles)("%s headwear leaves both eyes visible", (style) => {
		expect(headwearBlocks(style, "#000").filter(coversAnEye)).toEqual([]);
	});

	const top = (blocks: readonly Cuboid[]): number =>
		Math.max(...blocks.map((block) => block.at[1] + block.size[1] / 2));
	const hatHair = hairStyles.filter((style) => !hatlessHairStyles.includes(style));
	const hats = ["cap", "beanie"] as const;
	it.each(hatHair.flatMap((hair) => hats.map((hat) => [hat, hair] as const)))(
		"a %s covers %s hair from above",
		(hat, hair) => {
			expect(top(headwearBlocks(hat, "#000"))).toBeGreaterThan(top(hairBlocks(hair, "#000")));
		},
	);
});
