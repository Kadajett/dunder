import {
	type AvatarStyle,
	browStyles,
	eyeStyles,
	glassesStyles,
	hairColors,
	hairStyles,
	headwearStyles,
	mouthStyles,
	outfitStyles,
	skinTones,
} from "@shared/avatar/style";
import { z } from "zod";

const colour = z.string().regex(/^#[0-9a-f]{6}$/i);

/** A persisted avatar look. Mirrors `AvatarStyle` exactly so stored styles render unchanged. */
export const avatarStyleSchema = z.object({
	skin: z.enum(skinTones),
	hair: z.object({ style: z.enum(hairStyles), color: z.enum(hairColors) }),
	outfit: z.object({ style: z.enum(outfitStyles), color: colour, accent: colour }),
	pants: colour,
	shoes: colour,
	eyes: z.enum(eyeStyles),
	brows: z.enum(browStyles),
	mouth: z.enum(mouthStyles),
	glasses: z.enum(glassesStyles).exactOptional(),
	headwear: z.object({ style: z.enum(headwearStyles), color: colour }).exactOptional(),
}) satisfies z.ZodType<AvatarStyle>;
