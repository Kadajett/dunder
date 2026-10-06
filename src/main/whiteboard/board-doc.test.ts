import { describe, expect, it } from "vitest";
import { type AgentPost, addPost, openBoard } from "./board-doc";

const note = (text = "idea"): AgentPost => ({ kind: "note", author: "nora", text });

describe("agent post placement", () => {
	it("reuses the cell a deleted post left, then carries on past the others", () => {
		const store = openBoard(null);
		addPost(store, note());
		const middle = addPost(store, note());
		addPost(store, note());
		store.remove([middle.id]);

		expect(addPost(store, note())).toMatchObject({ x: 320, y: 80 });
		expect(addPost(store, note())).toMatchObject({ x: 800, y: 80 });
	});

	it("keeps clear of shapes Jeremy drew", () => {
		const store = openBoard(null);
		const drawn = addPost(store, { ...note(), x: 200, y: 60 });
		store.put([{ ...drawn, meta: {} }]);

		expect(addPost(store, note())).toMatchObject({ x: 560, y: 80 });
	});

	it("grows a long note and keeps the next row clear of it", () => {
		const store = openBoard(null);
		const long = addPost(store, note("a long thought that goes on ".repeat(12)));
		const growY = "growY" in long.props ? long.props.growY : 0;
		expect(growY).toBeGreaterThan(240);

		for (let i = 0; i < 4; i++) addPost(store, note());
		expect(addPost(store, note())).toMatchObject({ x: 320, y: 320 });
	});

	it("leaves a short note square", () => {
		expect(addPost(openBoard(null), note("ship it")).props).toMatchObject({ growY: 0 });
	});
});
