import { describe, expect, it } from "vitest";
import { noteAt, tagNote, type Versioned } from "./sticky-note";

const base = { version: 3, versionNonce: 1, updated: 0 };
const rect: Versioned = {
	...base,
	id: "r",
	type: "rectangle",
	x: 100,
	y: 100,
	width: 200,
	height: 150,
	customData: { author: "carl", kind: "note" },
};
const text: Versioned = {
	...base,
	id: "t",
	type: "text",
	x: 120,
	y: 160,
	width: 160,
	height: 30,
	containerId: "r",
	text: "undo",
	originalText: "undo",
	customData: { author: "carl", kind: "note" },
};
const drawing: Versioned = {
	...base,
	id: "d",
	type: "ellipse",
	x: 0,
	y: 0,
	width: 500,
	height: 500,
};

describe("noteAt", () => {
	it("finds a note's text anywhere on the note, selected or not; the topmost shape wins", () => {
		expect(noteAt([drawing, rect, text], 110, 240)?.id).toBe("t");
		expect(noteAt([rect, text, drawing], 110, 240)).toBeUndefined();
		expect(noteAt([drawing, rect, text], 20, 20)).toBeUndefined();
		expect(noteAt([drawing, { ...rect, isDeleted: true }, text], 110, 240)).toBeUndefined();
	});
});

describe("tagNote", () => {
	it("tags the note's text and rectangle with the bead and bumps their versions, so the sync saves it", () => {
		const [taggedRect, taggedText, untouched] = tagNote(
			[rect, text, drawing],
			new Set(["r", "t"]),
			"office-x1",
			9,
		);
		expect(taggedText).toMatchObject({
			text: "undo\n↗ office-x1",
			originalText: "undo\n↗ office-x1",
			version: 4,
			updated: 9,
			customData: { author: "carl", kind: "note", beadId: "office-x1" },
		});
		expect(taggedRect).toMatchObject({ version: 4, customData: { beadId: "office-x1" } });
		expect(untouched).toBe(drawing);
	});
});
