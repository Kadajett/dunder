import type { ChiefMessage } from "@shared/chief";
import { describe, expect, it } from "vitest";
import { NEW_TURN, type TurnWatch, watchMessage, watchPresence } from "./call-turn";

const SINCE = 1_000;
const you = (state: ChiefMessage["state"], at = SINCE + 1): ChiefMessage => ({
	id: "y1",
	author: "you",
	text: "is the board fixed?",
	at,
	state,
	call: true,
});
const reply = (spoken?: string, at = SINCE + 2): ChiefMessage => ({
	id: "c1",
	author: "chief",
	text: "Yes.",
	at,
	...(spoken !== undefined && { spoken }),
});

/** Runs presences through the watch, returning the steps seen. */
function steps(start: TurnWatch | null, presences: readonly Parameters<typeof watchPresence>[1][]) {
	let watch = start;
	return presences.map((presence) => {
		const next = watchPresence(watch, presence);
		watch = next.watch;
		return next.step;
	});
}

describe("call turn", () => {
	it("finishes only after he worked on the delivered turn and went idle", () => {
		const delivered = watchMessage(NEW_TURN, you("sent"), SINCE).watch;
		expect(steps(delivered, ["idle", "working", "working", "idle"])).toEqual([
			"none",
			"working",
			"working",
			"finished",
		]);
	});

	it("ignores him going idle while the turn is still queued behind other work", () => {
		const queued = watchMessage(NEW_TURN, you("queued"), SINCE).watch;
		expect(steps(queued, ["working", "idle"])).toEqual(["none", "none"]);
		// The flush puts it in; only work after that counts.
		const flushed = watchMessage(queued, you("sent"), SINCE).watch;
		expect(steps(flushed, ["working", "done"])).toEqual(["working", "finished"]);
	});

	it("answers the turn with a spoken line, but not with a plain reply or one from before the call", () => {
		const delivered = { delivered: true, sawWorking: true };
		expect(watchMessage(delivered, reply(), SINCE)).toEqual({ watch: delivered, spoken: null });
		expect(watchMessage(delivered, reply("Yes, it's fixed.", SINCE - 5), SINCE)).toEqual({
			watch: delivered,
			spoken: null,
		});
		expect(watchMessage(delivered, reply("Yes, it's fixed."), SINCE)).toEqual({
			watch: null,
			spoken: "Yes, it's fixed.",
		});
	});

	it("does nothing without a turn in flight", () => {
		expect(steps(null, ["working", "idle"])).toEqual(["none", "none"]);
		expect(watchMessage(null, you("sent"), SINCE).watch).toBeNull();
	});
});
