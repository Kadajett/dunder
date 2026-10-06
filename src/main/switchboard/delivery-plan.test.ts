import type { AgentStatus } from "@shared/herdr/schema";
import {
	deliveryText,
	exceedsPairLimit,
	type OfficeMessage,
	PAIR_LIMIT,
} from "@shared/switchboard";
import { describe, expect, it } from "vitest";
import { MISSING_RECIPIENT_TIMEOUT_MS, type Pending, planDeliveries } from "./delivery-plan";

const message = (id: string, to: string, from = "nora"): Pending => ({
	message: {
		id,
		from,
		to,
		text: `msg ${id}`,
		sentAt: "2026-10-06T00:00:00.000Z",
		state: "queued",
	} satisfies OfficeMessage,
	receivedAt: 0,
});

const statuses = (map: Record<string, AgentStatus>) => (name: string) => map[name];

describe("planDeliveries", () => {
	it("delivers only to agents ready for input, never interrupting work or answering dialogs", () => {
		const plan = planDeliveries(
			[message("1", "ava"), message("2", "ben"), message("3", "jonas"), message("4", "leo")],
			statuses({ ava: "idle", ben: "working", jonas: "blocked", leo: "done" }),
			1_000,
		);
		expect(plan.deliver.map((p) => p.message.id)).toEqual(["1", "4"]);
		expect(plan.wait.map((p) => p.message.id)).toEqual(["2", "3"]);
	});

	it("sends one message per recipient per round, oldest first", () => {
		const plan = planDeliveries(
			[message("1", "ava"), message("2", "ava")],
			statuses({ ava: "idle" }),
			0,
		);
		expect(plan.deliver.map((p) => p.message.id)).toEqual(["1"]);
		expect(plan.wait.map((p) => p.message.id)).toEqual(["2"]);
	});

	it("waits for a missing recipient, then fails it after the timeout", () => {
		const queue = [message("1", "ghost")];
		expect(planDeliveries(queue, statuses({}), MISSING_RECIPIENT_TIMEOUT_MS - 1).wait).toHaveLength(
			1,
		);
		const late = planDeliveries(queue, statuses({}), MISSING_RECIPIENT_TIMEOUT_MS);
		expect(late.fail[0]?.reason).toContain("ghost");
	});
});

describe("deliveryText", () => {
	it("attributes the sender and tells the recipient how to reply", () => {
		const text = deliveryText({ from: "nora", text: "ping" });
		expect(text.startsWith("[office message from nora] ping")).toBe(true);
		expect(text).toContain("office-say nora");
		expect(deliveryText({ from: "someone", text: "ping" })).not.toContain("office-say");
	});
});

describe("exceedsPairLimit", () => {
	const at = (
		minutesAgo: number,
		from: string,
		to: string,
		state: "delivered" | "failed" = "delivered",
	) => ({
		from,
		to,
		state,
		sentAt: new Date(Date.parse("2026-10-06T12:00:00Z") - minutesAgo * 60_000).toISOString(),
	});
	const now = Date.parse("2026-10-06T12:00:00Z");

	it("stops a pair after PAIR_LIMIT recent deliveries in either direction", () => {
		const chatter = Array.from({ length: PAIR_LIMIT.messages }, (_, i) =>
			i % 2 === 0 ? at(i, "nora", "jonas") : at(i, "jonas", "nora"),
		);
		expect(exceedsPairLimit(chatter.slice(1), { from: "nora", to: "jonas" }, now)).toBe(false);
		expect(exceedsPairLimit(chatter, { from: "nora", to: "jonas" }, now)).toBe(true);
	});

	it("ignores old, failed and other pairs' messages", () => {
		const history = [
			...Array.from({ length: PAIR_LIMIT.messages }, () => at(11, "nora", "jonas")),
			...Array.from({ length: PAIR_LIMIT.messages }, () => at(1, "nora", "jonas", "failed")),
			...Array.from({ length: PAIR_LIMIT.messages }, () => at(1, "ava", "jonas")),
		];
		expect(exceedsPairLimit(history, { from: "jonas", to: "nora" }, now)).toBe(false);
	});
});
