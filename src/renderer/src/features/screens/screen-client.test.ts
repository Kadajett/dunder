import type { ScreenChunk, ScreenStatus } from "@shared/screens";
import { describe, expect, it } from "vitest";
import { textChunk as chunk, FakeScreensApi } from "./fixtures/fake-screens-api";
import { createScreenClient, type ScreenListener } from "./screen-client";

class Recorder implements ScreenListener {
	readonly chunks: string[] = [];
	readonly states: string[] = [];
	chunk(chunk: ScreenChunk): void {
		this.chunks.push(new TextDecoder().decode(chunk.data));
	}
	status(status: ScreenStatus): void {
		this.states.push(status.state);
	}
}

describe("createScreenClient", () => {
	it("shares one observe subscription per pane across listeners", () => {
		const api = new FakeScreensApi();
		const client = createScreenClient(api, "win");
		const offA = client.observe("p1", new Recorder());
		const offB = client.observe("p1", new Recorder());
		expect(api.calls).toEqual(["observe win p1"]);
		offA();
		expect(api.calls).toEqual(["observe win p1"]);
		offB();
		expect(api.calls).toEqual(["observe win p1", "unobserve win p1"]);
		expect(api.portListeners.size).toBe(0);
	});

	it("treats repeated unsubscribes as no-ops (StrictMode cleanups)", () => {
		const api = new FakeScreensApi();
		const client = createScreenClient(api, "win");
		const offA = client.observe("p1", new Recorder());
		client.observe("p1", new Recorder());
		offA();
		offA();
		expect(api.calls).toEqual(["observe win p1"]);
	});

	it("listens on the port before asking main to observe", () => {
		const api = new FakeScreensApi();
		const client = createScreenClient(api, "win");
		const order: string[] = [];
		const onMessage = api.onMessage.bind(api);
		api.onMessage = (listener) => {
			order.push("listen");
			return onMessage(listener);
		};
		api.observe = () => order.push("observe");
		client.observe("p1", new Recorder());
		expect(order).toEqual(["listen", "observe"]);
	});

	it("routes chunks and statuses to the matching stream only", () => {
		const api = new FakeScreensApi();
		const client = createScreenClient(api, "win");
		const p1 = new Recorder();
		const p2 = new Recorder();
		const control = new Recorder();
		client.observe("p1", p1);
		client.observe("p2", p2);
		client.control("p1", control);
		api.emit({
			type: "chunks",
			chunks: [
				chunk("observe", "p1", "a"),
				chunk("observe", "p2", "b"),
				chunk("control", "p1", "c"),
			],
		});
		api.emit({ type: "status", status: { kind: "observe", id: "p2", state: "live" } });
		api.emit({ type: "chunks", chunks: [chunk("observe", "p3", "ignored")] });
		expect(p1.chunks).toEqual(["a"]);
		expect(p2.chunks).toEqual(["b"]);
		expect(control.chunks).toEqual(["c"]);
		expect(p1.states).toEqual([]);
		expect(p2.states).toEqual(["live"]);
		expect(api.calls).toEqual(["observe win p1", "observe win p2"]);
	});

	it("replays the latest status to a late listener", () => {
		const api = new FakeScreensApi();
		const client = createScreenClient(api, "win");
		client.observe("p1", new Recorder());
		api.emit({ type: "status", status: { kind: "observe", id: "p1", state: "live" } });
		api.emit({ type: "status", status: { kind: "observe", id: "p1", state: "disconnected" } });
		const late = new Recorder();
		client.observe("p1", late);
		expect(late.states).toEqual(["disconnected"]);
	});

	it("starts a fresh subscription after the last listener left", () => {
		const api = new FakeScreensApi();
		const client = createScreenClient(api, "win");
		client.observe("p1", new Recorder())();
		const again = new Recorder();
		client.observe("p1", again);
		api.emit({ type: "chunks", chunks: [chunk("observe", "p1", "x")] });
		expect(api.calls).toEqual(["observe win p1", "unobserve win p1", "observe win p1"]);
		expect(again.chunks).toEqual(["x"]);
		expect(again.states).toEqual([]);
	});
});
