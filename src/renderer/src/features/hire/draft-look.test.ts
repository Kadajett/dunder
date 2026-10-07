import { stepPart } from "@shared/avatar/look";
import { avatarStyleFor } from "@shared/avatar/style";
import { describe, expect, it } from "vitest";
import { draftStyle, type LookDraft, rerolledLook } from "./draft-look";

describe("a new hire's look", () => {
	const typed: LookDraft = { name: "ava", seed: undefined, look: undefined };

	it("follows the name until the first pick, then stays as picked while the name changes", () => {
		expect(draftStyle({ ...typed, name: "ben" })).toEqual(avatarStyleFor("ben"));
		const picked: LookDraft = { ...typed, look: stepPart(draftStyle(typed), "glasses", 1).style };
		const renamed = { ...picked, name: "avalon" };
		expect(draftStyle(renamed)).toEqual(draftStyle(picked));
		expect(draftStyle(renamed).glasses).not.toBe(avatarStyleFor("ava").glasses);
		expect(draftStyle(renamed)).not.toEqual(avatarStyleFor("avalon"));
		// The rest of the look is the name's, untouched by the pick.
		expect({ ...draftStyle(renamed), glasses: undefined }).toEqual({
			...avatarStyleFor("ava"),
			glasses: undefined,
		});
	});

	it("rerolls everything and drops the picks on '↻ New look'", () => {
		const picked: LookDraft = { ...typed, look: stepPart(draftStyle(typed), "hair", 1).style };
		const fresh = { ...picked, ...rerolledLook("seed-2") };
		expect(draftStyle(fresh)).toEqual(avatarStyleFor("seed-2"));
		expect(draftStyle({ ...fresh, name: "zed" })).toEqual(avatarStyleFor("seed-2"));
	});
});
