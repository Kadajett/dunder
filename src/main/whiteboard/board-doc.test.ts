import type { WhiteboardElement, WhiteboardScene } from "@shared/whiteboard";
import { elementBox } from "@shared/whiteboard-geometry";
import { describe, expect, it } from "vitest";
import { addPost, digestItems, EMPTY_SCENE, mergeScenes, parseScene } from "./board-doc";

/** A plain element as the editor saves one, with the fields under test overridden. */
function drawn(fields: Record<string, unknown>): WhiteboardElement {
	return parseScene({
		elements: [
			{
				id: "r1",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				angle: 0,
				version: 1,
				versionNonce: 5,
				isDeleted: false,
				index: "a0",
				...fields,
			},
		],
	}).elements[0] as WhiteboardElement;
}

const overlap = (a: WhiteboardElement, b: WhiteboardElement): boolean => {
	const [p, q] = [elementBox(a), elementBox(b)];
	if (!p || !q) return false;
	return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
};

describe("agent posts", () => {
	it("makes a note a filled rectangle with its text bound inside, stacked on top and clear of what is there", () => {
		const existing: WhiteboardScene = {
			elements: [drawn({ x: 60, y: 60, width: 300, height: 300 })],
		};
		const { scene, records } = addPost(existing, {
			kind: "note",
			author: "nora",
			text: "a ".repeat(60),
			color: "pink",
		});
		const [rect, text] = records;
		if (!rect || !text || text.type !== "text")
			throw new Error("expected a rectangle and its text");
		expect(rect).toMatchObject({
			type: "rectangle",
			backgroundColor: "#ffc9c9",
			boundElements: [{ type: "text", id: text.id }],
		});
		expect(text).toMatchObject({
			containerId: rect.id,
			originalText: "a ".repeat(60),
			customData: { author: "nora", kind: "note" },
		});
		// Long text grows the note and wraps inside it.
		expect(rect.height).toBeGreaterThan(200);
		expect(text.text.split("\n").length).toBeGreaterThan(1);
		expect(overlap(rect, existing.elements[0] as WhiteboardElement)).toBe(false);
		expect(scene.elements.map((element) => element.index)).toEqual(["a0", rect.index, text.index]);
		expect((rect.index ?? "") > "a0" && (text.index ?? "") > (rect.index ?? "")).toBe(true);
	});

	it("puts text where the agent asked, unwrapped", () => {
		const { records } = addPost(EMPTY_SCENE, {
			kind: "text",
			author: "ava",
			text: "Agenda\nQ4",
			x: 40,
			y: 900,
		});
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			type: "text",
			x: 40,
			y: 900,
			containerId: null,
			text: "Agenda\nQ4",
		});
	});
});

describe("the digest", () => {
	it("lists text top-left first: in a shape a note, free text as text, Jeremy's unsigned", () => {
		let scene: WhiteboardScene = {
			elements: [
				drawn({ id: "box", x: 500, y: 0, boundElements: [{ type: "text", id: "label" }] }),
			],
		};
		scene = {
			elements: [
				...scene.elements,
				drawn({
					id: "label",
					type: "text",
					x: 510,
					y: 10,
					text: "his label",
					originalText: "his label",
					containerId: "box",
				}),
			],
		};
		scene = addPost(scene, { kind: "text", author: "ava", text: "top", x: 0, y: -50 }).scene;
		scene = {
			elements: [
				...scene.elements,
				drawn({
					id: "old",
					type: "text",
					isDeleted: true,
					text: "gone",
					originalText: "gone",
					containerId: null,
				}),
			],
		};
		expect(digestItems(scene)).toEqual([
			{ kind: "text", author: "ava", text: "top" },
			{ kind: "note", author: "jeremy", text: "his label" },
		]);
	});
});

describe("merging the editor's save", () => {
	const stored: WhiteboardScene = {
		elements: [
			drawn({ id: "a", version: 3 }),
			drawn({ id: "b", version: 2, versionNonce: 9 }),
			drawn({ id: "agent", version: 1 }),
		],
	};

	it("keeps the newer version of each element, the lower nonce on a tie, and main-only elements on top", () => {
		const saved: WhiteboardScene = {
			elements: [
				drawn({ id: "b", version: 2, versionNonce: 4, x: 7 }),
				drawn({ id: "a", version: 2, x: 9 }),
				drawn({ id: "new", version: 1 }),
			],
		};
		const { scene, merged } = mergeScenes(stored, saved);
		expect(scene.elements.map((element) => [element.id, element.version, element.x])).toEqual([
			["b", 2, 7],
			["a", 3, 0],
			["new", 1, 0],
			["agent", 1, 0],
		]);
		expect(merged).toBe(true);
	});

	it("takes a deletion saved as a newer version, and reports nothing to merge back when the editor has it all", () => {
		const saved: WhiteboardScene = {
			elements: stored.elements.map((element) => ({
				...element,
				version: element.version + 1,
				isDeleted: element.id === "agent",
			})),
		};
		const { scene, merged } = mergeScenes(stored, saved);
		expect(
			scene.elements.filter((element) => !element.isDeleted).map((element) => element.id),
		).toEqual(["a", "b"]);
		expect(merged).toBe(false);
	});
});

describe("parseScene", () => {
	it("passes element types it has never heard of, and refuses elements missing what main relies on", () => {
		expect(drawn({ type: "magicframe", extra: { anything: true } })).toMatchObject({
			type: "magicframe",
		});
		expect(() => parseScene({ elements: [{ id: "x", type: "rectangle" }] })).toThrow();
		expect(() => parseScene({ elements: "nope" })).toThrow();
	});
});
