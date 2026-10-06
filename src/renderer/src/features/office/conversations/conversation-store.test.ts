import type { OfficeMessage } from "@shared/switchboard";
import { beforeEach, describe, expect, it } from "vitest";
import { BUBBLE_MS, speechFor, useConversations, visitFor } from "./conversation-store";

const message = (id: string, state: OfficeMessage["state"], from = "nora"): OfficeMessage => ({
	id,
	from,
	to: "ava",
	text: `text ${id}`,
	sentAt: "2026-10-06T00:00:00.000Z",
	state,
});

describe("speech bubbles", () => {
	beforeEach(() => useConversations.setState({ heard: [] }));

	it("thinks while queued, speaks once delivered, then falls silent", () => {
		const { upsert } = useConversations.getState();
		upsert(message("1", "queued"), 1_000);
		expect(speechFor(useConversations.getState().heard, "nora", 1_500)).toMatchObject({
			kind: "waiting",
		});
		upsert(message("1", "delivered"), 60_000);
		expect(
			speechFor(useConversations.getState().heard, "nora", 60_000 + BUBBLE_MS - 1),
		).toMatchObject({
			kind: "saying",
		});
		expect(
			speechFor(useConversations.getState().heard, "nora", 60_000 + BUBBLE_MS),
		).toBeUndefined();
	});

	it("only shows the speaker's own latest message", () => {
		const { upsert } = useConversations.getState();
		upsert(message("1", "delivered", "ben"), 0);
		expect(speechFor(useConversations.getState().heard, "nora", 1)).toBeUndefined();
		expect(speechFor(useConversations.getState().heard, "ben", 1)?.message.id).toBe("1");
	});

	it("never replays history from before the window opened as fresh speech", () => {
		useConversations.getState().replace([message("old", "delivered")], 10_000);
		expect(speechFor(useConversations.getState().heard, "nora", 10_000)).toBeUndefined();
	});

	it("does not restart the bubble timer when the same state is re-sent", () => {
		const { upsert } = useConversations.getState();
		upsert(message("1", "delivered"), 0);
		upsert(message("1", "delivered"), BUBBLE_MS - 10);
		expect(speechFor(useConversations.getState().heard, "nora", BUBBLE_MS)).toBeUndefined();
	});
});

describe("visitFor", () => {
	beforeEach(() => useConversations.setState({ heard: [] }));
	const desk = { position: { x: 1, z: 2 }, rotationY: 0 };
	const spotFor = (name: string) => (name === "ava" ? desk : undefined);

	it("walks the sender to the recipient while the message is being said, on the brain clock", () => {
		useConversations.getState().upsert(message("1", "delivered"), 1_000);
		const visit = visitFor(
			useConversations.getState().heard,
			"nora",
			{ nowMs: 6_000, brainNow: 50 },
			spotFor,
		);
		expect(visit).toEqual({ id: "1", at: desk, until: 50 + (BUBBLE_MS - 5_000) / 1000 });
	});

	it("has no visit while queued, after the window, or when the recipient has no desk", () => {
		const { upsert } = useConversations.getState();
		upsert(message("1", "queued"), 0);
		const clock = { nowMs: 10, brainNow: 0 };
		expect(visitFor(useConversations.getState().heard, "nora", clock, spotFor)).toBeUndefined();
		upsert(message("1", "delivered"), 0);
		const late = { nowMs: BUBBLE_MS, brainNow: 0 };
		expect(visitFor(useConversations.getState().heard, "nora", late, spotFor)).toBeUndefined();
		expect(
			visitFor(useConversations.getState().heard, "nora", clock, () => undefined),
		).toBeUndefined();
	});
});
