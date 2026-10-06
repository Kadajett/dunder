import type { HerdrEvent } from "@shared/herdr/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HerdrApi, HerdrSubscription, SubscriptionHandlers } from "./api-client";
import { createEventStream, subscriptionsFor } from "./event-stream";

interface FakeSubscription {
	readonly subscriptions: readonly HerdrSubscription[];
	readonly handlers: SubscriptionHandlers;
	closed: boolean;
}

function fakeApi() {
	const opened: FakeSubscription[] = [];
	const api: Pick<HerdrApi, "subscribe"> = {
		subscribe(subscriptions, handlers) {
			const subscription: FakeSubscription = { subscriptions, handlers, closed: false };
			opened.push(subscription);
			return {
				close() {
					subscription.closed = true;
				},
			};
		},
	};
	return { api, opened };
}

function setup(retryDelayMs = 500) {
	const { api, opened } = fakeApi();
	const events: HerdrEvent[] = [];
	const connection: boolean[] = [];
	const stream = createEventStream({
		api,
		onEvent: (event) => events.push(event),
		onConnectionChange: (connected) => connection.push(connected),
		retryDelayMs,
	});
	const latest = (): FakeSubscription => {
		const subscription = opened.at(-1);
		if (!subscription) throw new Error("no subscription opened");
		return subscription;
	};
	return { stream, opened, events, connection, latest };
}

const paneIdsOf = (subscriptions: readonly HerdrSubscription[]): unknown[] =>
	subscriptions.filter((s) => s.type === "pane.agent_status_changed").map((s) => s["pane_id"]);

describe("subscriptionsFor", () => {
	it("adds one pane.agent_status_changed subscription per pane", () => {
		const subscriptions = subscriptionsFor(["p1", "p2"]);

		expect(subscriptions).toContainEqual({ type: "pane.agent_status_changed", pane_id: "p1" });
		expect(subscriptions).toContainEqual({ type: "pane.agent_status_changed", pane_id: "p2" });
		expect(paneIdsOf(subscriptions)).toHaveLength(2);
	});

	it("still watches topology events when there are no panes", () => {
		const types = subscriptionsFor([]).map((s) => s.type);

		expect(types).toContain("pane.created");
		expect(types).toContain("workspace.created");
		expect(types).not.toContain("pane.agent_status_changed");
	});
});

describe("createEventStream", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("subscribes for the given panes and reports connected once started", () => {
		const { stream, opened, connection, latest } = setup();

		stream.setPanes(["p1"]);

		expect(opened).toHaveLength(1);
		expect(paneIdsOf(latest().subscriptions)).toEqual(["p1"]);
		expect(connection).toEqual([]);
		latest().handlers.onStart?.();
		expect(connection).toEqual([true]);
	});

	it("forwards events from the live subscription", () => {
		const { stream, events, latest } = setup();
		stream.setPanes([]);
		const event = { event: "pane_created", data: { pane_id: "p1" } };

		latest().handlers.onEvent(event);

		expect(events).toEqual([event]);
	});

	it("does not resubscribe when the pane set is unchanged, regardless of order", () => {
		const { stream, opened } = setup();
		stream.setPanes(["p1", "p2"]);

		stream.setPanes(["p2", "p1"]);

		expect(opened).toHaveLength(1);
		expect(opened[0]?.closed).toBe(false);
	});

	it("opens a new subscription and closes the previous one when the pane set changes", () => {
		const { stream, opened } = setup();
		stream.setPanes(["p1"]);

		stream.setPanes(["p1", "p2"]);

		expect(opened).toHaveLength(2);
		expect(opened[0]?.closed).toBe(true);
		expect(opened[1]?.closed).toBe(false);
		expect(paneIdsOf(opened[1]?.subscriptions ?? [])).toEqual(["p1", "p2"]);
	});

	it("ignores the close of a superseded subscription", () => {
		const { stream, opened, connection } = setup(500);
		stream.setPanes(["p1"]);
		stream.setPanes(["p2"]);

		opened[0]?.handlers.onClose();
		vi.advanceTimersByTime(500);

		expect(connection).toEqual([]);
		expect(opened).toHaveLength(2);
	});

	it("reports disconnect on server close and resubscribes after the retry delay", () => {
		const { stream, opened, connection, latest } = setup(500);
		stream.setPanes(["p1"]);
		latest().handlers.onStart?.();

		latest().handlers.onClose(new Error("socket reset"));

		expect(connection).toEqual([true, false]);
		vi.advanceTimersByTime(499);
		expect(opened).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(opened).toHaveLength(2);
		expect(paneIdsOf(latest().subscriptions)).toEqual(["p1"]);
		latest().handlers.onStart?.();
		expect(connection).toEqual([true, false, true]);
	});

	it("keeps retrying while the server stays unavailable", () => {
		const { stream, opened, latest } = setup(500);
		stream.setPanes([]);

		latest().handlers.onClose();
		vi.advanceTimersByTime(500);
		latest().handlers.onClose();
		vi.advanceTimersByTime(500);

		expect(opened).toHaveLength(3);
	});

	it("resubscribes immediately on setPanes while disconnected, without a duplicate retry", () => {
		const { stream, opened, latest } = setup(500);
		stream.setPanes(["p1"]);
		latest().handlers.onClose();

		stream.setPanes(["p1"]);
		expect(opened).toHaveLength(2);
		vi.advanceTimersByTime(5_000);

		expect(opened).toHaveLength(2);
	});

	it("stops retrying after close()", () => {
		const { stream, opened, latest } = setup(500);
		stream.setPanes(["p1"]);
		latest().handlers.onClose();

		stream.close();
		vi.advanceTimersByTime(5_000);

		expect(opened).toHaveLength(1);
	});

	it("closes the live subscription and ignores later activity after close()", () => {
		const { stream, opened, connection, latest } = setup(500);
		stream.setPanes(["p1"]);
		const live = latest();

		stream.close();
		live.handlers.onClose();
		stream.setPanes(["p2"]);
		vi.advanceTimersByTime(5_000);

		expect(live.closed).toBe(true);
		expect(connection).toEqual([]);
		expect(opened).toHaveLength(1);
	});
});
