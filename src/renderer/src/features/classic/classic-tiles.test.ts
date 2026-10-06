import type { Desk, Zone } from "@shared/layout/schema";
import { describe, expect, it } from "vitest";
import type { LiveAgent } from "../office/model/live-agents";
import { classicTiles } from "./classic-tiles";
import { closeTile, NO_OPEN_TILES, openTile, pruneTiles, toggleWide } from "./open-tiles";

const agent = (name: string, paneId: string, workspaceLabel?: string): LiveAgent => ({
	name,
	paneId,
	workspaceLabel,
	status: "idle",
	kind: "omp",
});

const desk = (id: string, zoneId?: string): Desk => ({
	id,
	position: { x: 0, z: 0 },
	rotation: 0,
	reserved: false,
	chairColor: "#000",
	...(zoneId ? { zoneId } : {}),
});

const zones: Zone[] = [{ id: "eng", title: "Engineering", labelHeight: 2.2 }];

describe("classicTiles", () => {
	it("lists seated agents in desk order, then the rest by pane creation order", () => {
		const nora = agent("nora", "w1:p3");
		const jonas = agent("jonas", "w1:p1");
		const ava = agent("ava", "w1:p10", "ops");
		const ben = agent("ben", "w1:p9");
		const tiles = classicTiles(
			{
				agents: [ava, nora, ben, jonas],
				seated: [
					{ desk: desk("d1", "eng"), agent: nora },
					{ desk: desk("d2"), agent: jonas },
				],
			},
			zones,
		);
		expect(tiles.map((tile) => tile.agent.name)).toEqual(["nora", "jonas", "ben", "ava"]);
		expect(tiles.map((tile) => tile.seated)).toEqual([true, true, false, false]);
	});

	it("names the room after the desk's zone, else the agent's workspace", () => {
		const tiles = classicTiles(
			{
				agents: [],
				seated: [
					{ desk: desk("d1", "eng"), agent: agent("a", "w1:p1", "web") },
					{ desk: desk("d2"), agent: agent("b", "w1:p2", "web") },
					{ desk: desk("d3"), agent: agent("c", "w1:p3") },
				],
			},
			zones,
		);
		expect(tiles.map((tile) => tile.room)).toEqual(["Engineering", "web", "Open floor"]);
		const lone = classicTiles({ agents: [agent("d", "w1:p4")], seated: [] }, zones);
		expect(lone[0]?.room).toBe("No desk");
	});

	it("never gives one pane two tiles", () => {
		const nora = agent("nora", "w1:p1");
		const tiles = classicTiles(
			{ agents: [nora, agent("nora-dup", "w1:p1")], seated: [{ desk: desk("d1"), agent: nora }] },
			zones,
		);
		expect(tiles).toHaveLength(1);
	});
});

describe("open tiles", () => {
	it("opens a pane once, keeping its width on reopen", () => {
		const open = toggleWide(openTile(NO_OPEN_TILES, "p1"), "p1");
		expect(openTile(open, "p1").get("p1")).toEqual({ wide: true });
		expect([...openTile(open, "p2").keys()]).toEqual(["p1", "p2"]);
	});

	it("closes and toggles only open panes", () => {
		const open = openTile(openTile(NO_OPEN_TILES, "p1"), "p2");
		expect([...closeTile(open, "p1").keys()]).toEqual(["p2"]);
		expect(toggleWide(open, "p3")).toBe(open);
		expect(toggleWide(toggleWide(open, "p2"), "p2").get("p2")).toEqual({ wide: false });
	});

	it("drops panes that left the session and keeps identity otherwise", () => {
		const open = openTile(openTile(NO_OPEN_TILES, "p1"), "p2");
		expect(pruneTiles(open, new Set(["p1", "p2", "p3"]))).toBe(open);
		expect([...pruneTiles(open, new Set(["p2"])).keys()]).toEqual(["p2"]);
	});
});
