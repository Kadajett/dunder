import type { ScreenStatus } from "@shared/screens";
import type { TerminalCommand, TerminalOpenRequest } from "@shared/terminal";
import { describe, expect, it } from "vitest";
import type { PaneSize, StreamEvents } from "./herdr-stream";
import { SUPERSEDED_REASON, TerminalRegistry } from "./registry";
import type { ScreenSink } from "./screen-sink";

interface FakeControl {
	readonly request: TerminalOpenRequest;
	readonly events: StreamEvents;
	readonly sent: TerminalCommand[];
	closedWith: { restore: PaneSize | undefined } | undefined;
}

function settle(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

function setup(home?: PaneSize) {
	const controls: FakeControl[] = [];
	const resized: string[] = [];
	const registry = new TerminalRegistry({
		start: (request, events) => {
			const control: FakeControl = { request, events, sent: [], closedWith: undefined };
			controls.push(control);
			return {
				send: (command) => control.sent.push(command),
				close: (restore) => {
					control.closedWith = { restore };
				},
			};
		},
		...(home ? { homeSize: async () => home } : {}),
		onPaneResized: (paneId) => resized.push(paneId),
	});
	const statuses: ScreenStatus[] = [];
	const resets: boolean[] = [];
	const sink: ScreenSink = {
		ownerId: 1,
		write: (_kind, _id, _bytes, reset) => resets.push(reset),
		status: (status) => statuses.push(status),
	};
	return { registry, controls, statuses, resets, sink, resized };
}

const request = (paneId: string): TerminalOpenRequest => ({
	paneId,
	cols: 100,
	rows: 30,
	takeover: true,
});
const frame = { data: new Uint8Array([65]), full: false, cols: 100, rows: 30, seq: 1 };

describe("TerminalRegistry", () => {
	it("reports pane size changes on attach, on a resized frame and on exit", async () => {
		const { registry, controls, sink, resized } = setup();
		registry.open(request("w1:p1"), sink);
		await settle();
		const events = controls[0]?.events;
		events?.onFrame(frame);
		events?.onFrame(frame);
		expect(resized).toEqual(["w1:p1"]);
		events?.onFrame({ ...frame, cols: 90, rows: 20 });
		expect(resized).toEqual(["w1:p1", "w1:p1"]);
		events?.onClosed("detached");
		expect(resized).toEqual(["w1:p1", "w1:p1", "w1:p1"]);
	});

	it("queues commands until the control process exists", async () => {
		const { registry, controls, sink } = setup();
		const id = registry.open(request("w1:p1"), sink);
		registry.send(id, { type: "terminal.input", text: "early" });
		await settle();
		registry.send(id, { type: "terminal.input", text: "late" });
		expect(controls[0]?.sent).toEqual([
			{ type: "terminal.input", text: "early" },
			{ type: "terminal.input", text: "late" },
		]);
	});

	it("marks only the first frame of a screen as a reset and reports it live", async () => {
		const { registry, controls, statuses, resets, sink } = setup();
		const id = registry.open(request("w1:p1"), sink);
		await settle();
		controls[0]?.events.onFrame(frame);
		controls[0]?.events.onFrame(frame);
		expect(resets).toEqual([true, false]);
		expect(statuses.map((status) => [status.id, status.state])).toEqual([
			[id, "connecting"],
			[id, "live"],
		]);
	});

	it("starts a superseding screen only after the previous one on the pane has exited", async () => {
		const { registry, controls, statuses, sink } = setup({ cols: 60, rows: 40 });
		const first = registry.open(request("w1:p1"), sink);
		await settle();
		const second = registry.open(request("w1:p1"), sink);
		await settle();
		expect(controls).toHaveLength(1);
		// Superseded: no size restore, the new screen sizes the pane itself.
		expect(controls[0]?.closedWith).toEqual({ restore: undefined });
		controls[0]?.events.onClosed("detached");
		await settle();
		expect(controls).toHaveLength(2);
		expect(statuses).toContainEqual({
			kind: "control",
			id: first,
			state: "closed",
			reason: SUPERSEDED_REASON,
		});
		expect(second).not.toBe(first);
	});

	it("restores the pane's home size when a screen is closed", async () => {
		const { registry, controls, statuses, sink } = setup({ cols: 60, rows: 40 });
		const id = registry.open(request("w1:p1"), sink);
		await settle();
		registry.close(id);
		expect(controls[0]?.closedWith).toEqual({ restore: { cols: 60, rows: 40 } });
		controls[0]?.events.onClosed("detached");
		expect(statuses.at(-1)).toEqual({ kind: "control", id, state: "closed", reason: "closed" });
	});

	it("reports herdr's reason when the pane is taken over elsewhere", async () => {
		const { registry, controls, statuses, sink } = setup();
		const id = registry.open(request("w1:p1"), sink);
		await settle();
		controls[0]?.events.onClosed("terminal attach taken over");
		expect(statuses.at(-1)).toMatchObject({
			id,
			state: "closed",
			reason: "terminal attach taken over",
		});
		expect(registry.ownerOf(id)).toBeUndefined();
	});

	it("closing before launch never starts a process", async () => {
		const { registry, controls, sink } = setup();
		const id = registry.open(request("w1:p1"), sink);
		registry.close(id);
		await settle();
		expect(controls).toHaveLength(0);
	});

	it("shutdown resolves once every control process has exited", async () => {
		const { registry, controls, sink } = setup();
		registry.open(request("w1:p1"), sink);
		registry.open(request("w1:p2"), sink);
		await settle();
		let done = false;
		const shutdown = registry.shutdown().then(() => {
			done = true;
		});
		await settle();
		expect(done).toBe(false);
		for (const control of controls) control.events.onClosed("detached");
		await shutdown;
		expect(done).toBe(true);
	});
});
