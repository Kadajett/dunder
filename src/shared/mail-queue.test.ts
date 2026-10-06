import { describe, expect, it } from "vitest";
import type { ChiefMessage } from "./chief";
import { previewOf, queuedMail } from "./mail-queue";
import type { OfficeMessage } from "./switchboard";

const mail = (
	id: string,
	to: string,
	state: OfficeMessage["state"],
	sentAt = "2026-10-06T10:00:00.000Z",
): OfficeMessage => ({ id, from: "nora", to, text: `note ${id}`, sentAt, state });

const chat = (id: string, state: ChiefMessage["state"], at: number): ChiefMessage => ({
	id,
	author: "you",
	text: `chat ${id}`,
	at,
	...(state && { state }),
});

describe("queuedMail", () => {
	it("keeps only queued mail, grouped by recipient, oldest first", () => {
		const queue = queuedMail(
			[
				mail("b", "ava", "queued", "2026-10-06T10:05:00.000Z"),
				mail("a", "ava", "queued", "2026-10-06T10:01:00.000Z"),
				mail("c", "ava", "delivered"),
				mail("d", "ben", "failed"),
				mail("e", "ben", "queued"),
			],
			[],
			undefined,
		);
		expect(Object.keys(queue).sort()).toEqual(["ava", "ben"]);
		expect(queue["ava"]?.map((note) => note.id)).toEqual(["a", "b"]);
		expect(queue["ben"]).toEqual([
			{
				id: "e",
				from: "nora",
				fromJeremy: false,
				preview: "note e",
				at: Date.parse("2026-10-06T10:00:00.000Z"),
			},
		]);
	});

	it("puts Jeremy's queued chat on the chief's desk, alongside agents' mail to him", () => {
		const queue = queuedMail(
			[mail("m", "max", "queued", "1970-01-01T00:00:02.000Z")],
			[
				chat("sent", "sent", 1_000),
				chat("waiting", "queued", 3_000),
				chat("rejected", "rejected", 1),
			],
			"max",
		);
		expect(queue["max"]?.map(({ id, from, fromJeremy }) => ({ id, from, fromJeremy }))).toEqual([
			{ id: "m", from: "nora", fromJeremy: false },
			{ id: "waiting", from: "jeremy", fromJeremy: true },
		]);
	});

	it("drops Jeremy's chat when no chief is hired, and ignores the chief's own replies", () => {
		const reply: ChiefMessage = { id: "r", author: "chief", text: "on it", at: 5 };
		expect(queuedMail([], [chat("q", "queued", 1)], undefined)).toEqual({});
		expect(queuedMail([], [reply], "max")).toEqual({});
	});
});

describe("previewOf", () => {
	it("flattens whitespace and cuts long text to 40 characters with an ellipsis", () => {
		expect(previewOf("  short\n note ")).toBe("short note");
		const preview = previewOf(`${"a".repeat(30)} ${"b".repeat(30)}`);
		expect(preview).toHaveLength(40);
		expect(preview.endsWith("…")).toBe(true);
	});
});
