import type { ChiefMessage } from "@shared/chief";
import type { MailQueue } from "@shared/mail-queue";
import type { OfficeMessage } from "@shared/switchboard";
import { describe, expect, it } from "vitest";
import { MailQueueTracker } from "./tracker";

const message = (id: string, state: OfficeMessage["state"]): OfficeMessage => ({
	id,
	from: "max",
	to: "mika",
	text: "move the sales floor",
	sentAt: "2026-10-06T10:00:00.000Z",
	state,
});

const chat = (id: string, state: ChiefMessage["state"]): ChiefMessage => ({
	id,
	author: "you",
	text: "hi Max",
	at: 1_000,
	...(state && { state }),
});

function tracker(chief: string | undefined = "max") {
	const emitted: MailQueue[] = [];
	const board = new MailQueueTracker({
		chiefName: () => chief,
		emit: (queue) => emitted.push(queue),
	});
	const ids = (agent: string) => emitted.map((queue) => queue[agent]?.map((note) => note.id) ?? []);
	return { board, emitted, ids };
}

describe("MailQueueTracker", () => {
	it("emits a note when mail queues and an empty queue once it is delivered", () => {
		const { board, emitted, ids } = tracker();
		board.switchboard(message("1", "queued"));
		board.switchboard(message("1", "delivered"));
		expect(ids("mika")).toEqual([["1"], []]);
		expect(emitted.at(-1)).toEqual({});
		expect(board.current()).toEqual({});
	});

	it("drops failed mail too, and stays quiet when nothing changed", () => {
		const { board, emitted } = tracker();
		board.switchboard(message("1", "queued"));
		board.switchboard(message("1", "queued"));
		board.switchboard(message("2", "delivered"));
		board.switchboard(message("1", "failed"));
		expect(emitted).toHaveLength(2);
	});

	it("tracks Jeremy's chat to the chief from startup history through sending", () => {
		const { board, ids } = tracker();
		board.chiefHistory([chat("old", "queued"), chat("done", "sent")]);
		board.chief(chat("new", "queued"));
		board.chief(chat("old", "sent"));
		board.chief(chat("new", "sent"));
		expect(ids("max")).toEqual([["old"], ["old", "new"], ["new"], []]);
	});
});
