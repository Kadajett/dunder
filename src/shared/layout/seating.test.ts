import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT } from "./default-layout";
import { type Layout, layoutSchema } from "./schema";
import { comparePaneIds, type OfficeAgent, seatAgents } from "./seating";

const agent = (name: string, paneId: string, workspaceLabel?: string): OfficeAgent => ({
	name,
	paneId,
	workspaceLabel,
});

const layout: Layout = layoutSchema.parse({
	version: 1,
	room: {
		width: 10,
		depth: 10,
		wallHeight: 3,
		floorColor: "#000",
		wallColor: "#fff",
		windows: [],
		sign: { title: "T", subtitle: "S", offset: 1 },
	},
	zones: [
		{ id: "sales", title: "#SALES", workspaceLabel: "sales" },
		{ id: "lounge", title: "LOUNGE" },
	],
	desks: [
		{ id: "s1", position: { x: 0, z: 0 }, rotation: 0, zoneId: "sales" },
		{ id: "s2", position: { x: 1, z: 0 }, rotation: 0, zoneId: "sales" },
		{ id: "open", position: { x: 2, z: 0 }, rotation: 0 },
		{ id: "lounge", position: { x: 3, z: 0 }, rotation: 0, zoneId: "lounge" },
		{ id: "mine", position: { x: 4, z: 0 }, rotation: 0, reserved: true },
	],
	decor: [],
	callouts: [],
});

describe("seatAgents", () => {
	it("seats workspace members in their zone in pane-creation order", () => {
		const { seats } = seatAgents(layout, [
			agent("b", "w1:p10", "sales"),
			agent("a", "w1:p9", "sales"),
		]);
		expect(seats.get("s1")?.name).toBe("a");
		expect(seats.get("s2")?.name).toBe("b");
	});

	it("keeps existing seats when a later agent joins", () => {
		const before = seatAgents(layout, [agent("a", "w1:p1", "sales")]);
		const after = seatAgents(layout, [agent("a", "w1:p1", "sales"), agent("z", "w1:p2", "sales")]);
		expect(after.seats.get("s1")).toEqual(before.seats.get("s1"));
		expect(after.seats.get("s2")?.name).toBe("z");
	});

	it("honours a desk pinned to an agent name over zone order", () => {
		const pinned: Layout = {
			...layout,
			desks: layout.desks.map((desk) =>
				desk.id === "lounge" ? { ...desk, agentName: "a" } : desk,
			),
		};
		const { seats } = seatAgents(pinned, [agent("a", "w1:p1", "sales")]);
		expect(seats.get("lounge")?.name).toBe("a");
		expect(seats.has("s1")).toBe(false);
	});

	it("never seats an agent at a reserved desk and reports overflow", () => {
		const crowd = ["a", "b", "c", "d", "e", "f"].map((name, i) =>
			agent(name, `w1:p${i + 1}`, "sales"),
		);
		const { seats, unseated } = seatAgents(layout, crowd);
		expect(seats.has("mine")).toBe(false);
		expect(seats.size).toBe(4);
		expect(unseated.map((a) => a.name)).toEqual(["e", "f"]);
	});

	it("puts agents from unbound workspaces at open desks before overflow", () => {
		const { seats } = seatAgents(layout, [
			agent("s", "w1:p1", "sales"),
			agent("t", "w1:p2", "sales"),
			agent("u", "w1:p3", "sales"),
			agent("x", "w2:p1", "research"),
		]);
		expect(seats.get("open")?.name).toBe("x");
		expect(seats.get("lounge")?.name).toBe("u");
	});
});

describe("comparePaneIds", () => {
	it("orders numerically, not lexically", () => {
		expect(["w1:p10", "w2:p1", "w1:p9"].sort(comparePaneIds)).toEqual(["w1:p9", "w1:p10", "w2:p1"]);
	});
});

describe("DEFAULT_LAYOUT", () => {
	it("is a valid layout whose desks and labels reference real zones inside the room", () => {
		const parsed = layoutSchema.parse(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)));
		const zoneIds = new Set(parsed.zones.map((zone) => zone.id));
		const halfW = parsed.room.width / 2;
		const halfD = parsed.room.depth / 2;
		for (const desk of parsed.desks) {
			if (desk.zoneId) expect(zoneIds).toContain(desk.zoneId);
			expect(Math.abs(desk.position.x)).toBeLessThan(halfW);
			expect(Math.abs(desk.position.z)).toBeLessThan(halfD);
		}
		expect(new Set(parsed.desks.map((desk) => desk.id)).size).toBe(parsed.desks.length);
	});
});
