import type { OfficeMessage } from "@shared/switchboard";
import { describe, expect, it } from "vitest";
import { speechView } from "./speech-view";

const message: OfficeMessage = {
	id: "1",
	from: "mika",
	to: "raina",
	text: "line-up is ready",
	sentAt: "2026-10-06T00:00:00.000Z",
	state: "queued",
};

describe("speechView", () => {
	it("shows a waiting message as a bare mark, with its words only while hovered", () => {
		const waiting = { kind: "waiting", message } as const;
		expect(speechView(waiting, undefined, false)).toEqual({
			kind: "waiting",
			to: "raina",
			caption: null,
		});
		expect(speechView(waiting, undefined, true)).toEqual({
			kind: "waiting",
			to: "raina",
			caption: "waiting for raina to be free…",
		});
	});

	it("keeps spoken messages as full bubbles, hovered or not", () => {
		const saying = { kind: "saying", message: { ...message, state: "delivered" } } as const;
		const shown = { kind: "saying", to: "raina", text: "line-up is ready" };
		expect(speechView(saying, undefined, false)).toEqual(shown);
		expect(speechView(saying, undefined, true)).toEqual(shown);
	});

	it("reads out a fresh board note only when there is no conversation", () => {
		expect(speechView(undefined, "pf2 first", false)).toEqual({ kind: "board", text: "pf2 first" });
		expect(speechView(undefined, undefined, true)).toBeUndefined();
	});
});
