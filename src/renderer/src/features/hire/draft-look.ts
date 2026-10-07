import { type AvatarStyle, avatarStyleFor } from "@shared/avatar/style";

/** The draft fields that decide a new hire's look. */
export interface LookDraft {
	readonly name: string;
	/** Look seed after a reroll; until then the look follows the name. */
	readonly seed: string | undefined;
	/** Jeremy's picked look: once he picks a part, the name no longer changes it. */
	readonly look: AvatarStyle | undefined;
}

/** The look the draft would be hired with: the picked one, else seeded by the reroll or the name. */
export function draftStyle(draft: LookDraft): AvatarStyle {
	return draft.look ?? avatarStyleFor(draft.seed ?? (draft.name.trim() || "new-hire"));
}

/** '↻ New look': a fresh seed, and every pick cleared. */
export function rerolledLook(seed: string): Pick<LookDraft, "seed" | "look"> {
	return { seed, look: undefined };
}
