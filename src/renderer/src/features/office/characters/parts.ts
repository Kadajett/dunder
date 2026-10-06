import { type AvatarStyle, hashSeed } from "@shared/avatar/style";
import { glassesBlocks, headwearBlocks } from "./accessories";
import type { Cuboid } from "./Block";
import { type FaceStyle, faceDecals, headBlocks } from "./face";
import { type HairVariant, hairBlocks, hairVariantFor } from "./hair";
import { outfitBlocks, sleeveFor } from "./outfits";
import { ARM_REACH, ARM_WIDTH, CLOTH_GAP, NECK_Y, TORSO } from "./rig";

/**
 * The rigid parts of a character as cuboid lists, one per animated joint.
 * Within a part nothing moves, so any flush face between two colours would
 * z-fight forever; `parts.test.ts` holds every part to that.
 */

const ARM = { y: -0.17, height: 0.36 } as const;
const ARM_TOP = ARM.y + ARM.height / 2;
const SLEEVE = ARM_WIDTH + 2 * CLOTH_GAP;
const CUFF = SLEEVE + 2 * CLOTH_GAP;
const HAND = 0.1;

/** Arm blocks hanging from the shoulder pivot (−y), hand at `ARM_REACH`, in the arm's space. */
export function armPart(style: AvatarStyle): Cuboid[] {
	const sleeve = sleeveFor(style.outfit);
	const blocks: Cuboid[] = [
		{
			color: sleeve.long ? sleeve.color : style.skin,
			at: [0, ARM.y, 0],
			size: [ARM_WIDTH, ARM.height, ARM_WIDTH],
		},
		{ color: style.skin, at: [0, -ARM_REACH, 0], size: [HAND, HAND, HAND] },
	];
	// A short sleeve caps the shoulder: proud of the arm on every side, top included.
	const short = { top: ARM_TOP + CLOTH_GAP, height: 0.13 + CLOTH_GAP };
	if (!sleeve.long) {
		blocks.push({
			color: sleeve.color,
			at: [0, short.top - short.height / 2, 0],
			size: [SLEEVE, short.height, SLEEVE],
		});
	}
	if (sleeve.cuff) {
		// Long cuffs end short of the wrist so they never share the sleeve's end face.
		const cuff = sleeve.long
			? { y: ARM.y - ARM.height / 2 + 0.03, height: 0.04, width: SLEEVE }
			: { y: short.top - short.height - 0.002, height: 0.025, width: CUFF };
		blocks.push({
			color: sleeve.cuff,
			at: [0, cuff.y, 0],
			size: [cuff.width, cuff.height, cuff.width],
		});
	}
	return blocks;
}

/** Clothed torso and neck, in the upper body's space (hips at the origin). */
export function upperPart(style: AvatarStyle): Cuboid[] {
	return [
		...outfitBlocks(style.outfit).map(
			({ at: [x, y, z], ...block }): Cuboid => ({ ...block, at: [x, y + TORSO.y, z] }),
		),
		{ color: style.skin, at: [0, NECK_Y, 0], size: [0.14, 0.06, 0.14] },
	];
}

function faceStyleOf(style: AvatarStyle): FaceStyle {
	return {
		skin: style.skin,
		browColor: style.hair.color,
		eyes: style.eyes,
		brows: style.brows,
		mouth: style.mouth,
	};
}

/**
 * The hair touches a look gets, from the look itself: the same agent always
 * gets the same, and two agents with one cut rarely match. Built from fields,
 * not JSON, so key order (hire form vs saved roster) never changes it.
 */
function hairVariantOf(style: AvatarStyle): HairVariant {
	const { skin, hair, outfit, pants, shoes, eyes, brows, mouth } = style;
	const key = [
		skin,
		hair.style,
		hair.color,
		outfit.style,
		outfit.color,
		pants,
		shoes,
		eyes,
		brows,
		mouth,
	];
	return hairVariantFor(hashSeed(key.join("|")));
}

/** Everything on the head that has volume: skull, brows, hair, glasses and headwear. */
export function headPart(style: AvatarStyle, variant = hairVariantOf(style)): Cuboid[] {
	return [
		...headBlocks(faceStyleOf(style)),
		...hairBlocks(style.hair.style, style.hair.color, variant),
		...(style.glasses ? glassesBlocks(style.glasses) : []),
		...(style.headwear ? headwearBlocks(style.headwear.style, style.headwear.color) : []),
	];
}

/** Eyes, mouth and cheeks: flat, shadowless decals in head space. */
export function facePart(style: AvatarStyle): Cuboid[] {
	return faceDecals(faceStyleOf(style));
}
