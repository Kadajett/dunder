import { describe, expect, it } from "vitest";
import { changesScene, mergeElements } from "./whiteboard-merge";

const el = (id: string, version: number, versionNonce = 0, text = "") => ({
	id,
	version,
	versionNonce,
	text,
});

describe("mergeElements", () => {
	it("adds an agent's new note on top and keeps Jeremy's in-progress edits", () => {
		const local = [el("a", 3, 0, "mine, edited"), el("b", 1)];
		const remote = [el("a", 2, 0, "older copy"), el("note", 1, 7, "nora: ship it")];
		expect(mergeElements(local, remote).map((e) => `${e.id}:${e.text}`)).toEqual([
			"a:mine, edited",
			"b:",
			"note:nora: ship it",
		]);
	});

	it("takes the higher version, and the lower nonce on a tie, as Excalidraw does", () => {
		expect(mergeElements([el("a", 1)], [el("a", 2, 0, "newer")])[0]?.text).toBe("newer");
		expect(mergeElements([el("a", 2, 9, "mine")], [el("a", 2, 3, "theirs")])[0]?.text).toBe(
			"theirs",
		);
		expect(mergeElements([el("a", 2, 3, "mine")], [el("a", 2, 9, "theirs")])[0]?.text).toBe("mine");
	});

	it("knows when a remote scene has nothing new", () => {
		const local = [el("a", 3), el("b", 1)];
		expect(changesScene(local, [el("a", 2), el("b", 1)])).toBe(false);
		expect(changesScene(local, [el("c", 1)])).toBe(true);
	});
});
