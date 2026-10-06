import type { HerdrEvent, SessionSnapshot } from "@shared/herdr/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HerdrApi, SubscriptionHandlers } from "./api-client";
import { OfficeBridge } from "./office-bridge";

const snapshot = (status: "idle" | "working"): { snapshot: SessionSnapshot } => ({
	snapshot: {
		version: "0.9.3",
		protocol: 22,
		workspaces: [],
		tabs: [],
		panes: [],
		agents: [
			{
				pane_id: "w1:p1",
				tab_id: "w1:t1",
				workspace_id: "w1",
				terminal_id: "t",
				focused: false,
				agent_status: status,
				agent: "omp",
				name: "nora",
				label: undefined,
				cwd: undefined,
				foreground_cwd: undefined,
				terminal_title_stripped: undefined,
			},
		],
	},
});

function fakeApi() {
	let handlers: SubscriptionHandlers | undefined;
	let status: "idle" | "working" = "idle";
	const api: HerdrApi = {
		call: vi.fn(async () => snapshot(status)),
		subscribe: (_subscriptions, next) => {
			handlers = next;
			return { close: () => undefined };
		},
	};
	return {
		api,
		setStatus: (next: "idle" | "working") => {
			status = next;
		},
		emit: (event: HerdrEvent) => handlers?.onEvent(event),
	};
}

describe("OfficeBridge", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("re-snapshots while a busy agent floods pane updates", async () => {
		const herdr = fakeApi();
		const seen: string[] = [];
		const forwarded: string[] = [];
		const bridge = new OfficeBridge(
			herdr.api,
			{
				snapshot: (s) => seen.push(s.agents[0]?.agent_status ?? "none"),
				event: (e) => forwarded.push(e.event),
				status: () => undefined,
			},
			100,
		);
		bridge.start();
		herdr.setStatus("working");
		herdr.emit({
			event: "pane.agent_status_changed",
			data: { pane_id: "w1:p1", agent_status: "working" },
		});
		// Output updates every 50 ms would starve a 100 ms debounce forever.
		for (let i = 0; i < 10; i += 1) {
			herdr.emit({ event: "pane.updated", data: {} });
			await vi.advanceTimersByTimeAsync(50);
		}
		expect(seen).toContain("working");
		expect(forwarded).toEqual(["pane.agent_status_changed"]);
		bridge.stop();
	});
});
