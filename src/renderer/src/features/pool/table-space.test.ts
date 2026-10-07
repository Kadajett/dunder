import { JEREMY, type PoolView } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { STATION_SCALE } from "../office/scene/station";
import { poolPlayers, standingSpots, TABLE_OUTER, tableToWorld, worldToTable } from "./table-space";

const table = { center: { x: -10, z: -3 }, angle: Math.PI / 2 };

function view(overrides: Partial<PoolView> = {}): PoolView {
	return {
		stage: "playing",
		mode: "game",
		balls: [{ id: 0, x: 0.9, y: 0.1, pocket: null }],
		sides: [
			{ players: ["theo", "nora"], group: null, left: [] },
			{ players: ["mika", JEREMY], group: null, left: [] },
		],
		turn: 0,
		shooter: "theo",
		ballInHand: null,
		onEight: false,
		moving: false,
		shot: 3,
		queue: [],
		last: null,
		recent: [],
		result: null,
		jeremy: { joined: true, viewing: false, yourTurn: false },
		label: "",
		...overrides,
	};
}

describe("table space", () => {
	it("maps the cloth into the room like the decor draws it, and back", () => {
		// Turned 90°: the foot rail (+x on the cloth) points to −z in the room, +y on the cloth to −x.
		expect(tableToWorld(table, { x: 1, y: 0 }).z).toBeCloseTo(-3 - STATION_SCALE);
		expect(tableToWorld(table, { x: 0, y: 1 }).x).toBeCloseTo(-10 - STATION_SCALE);
		const point = { x: 0.37, y: -0.21 };
		const back = worldToTable(table, tableToWorld(table, point));
		expect(back.x).toBeCloseTo(point.x);
		expect(back.y).toBeCloseTo(point.y);
	});

	it("puts the agents of a game at the table, but not Jeremy, and nobody while it rests", () => {
		expect(poolPlayers(view())).toEqual(["theo", "nora", "mika"]);
		expect(poolPlayers(view({ stage: "finished", shooter: null }))).toEqual([
			"theo",
			"nora",
			"mika",
		]);
		expect(poolPlayers(view({ stage: "resting", sides: [] }))).toEqual([]);
		expect(standingSpots(table, view({ stage: "resting", sides: [] })).size).toBe(0);
	});

	it("stands the shooter at the rail nearest the cue ball, facing it, and the others clear of the shooter", () => {
		const spots = standingSpots(table, view());
		const shooter = spots.get("theo");
		if (!shooter) throw new Error("no spot for the shooter");
		const local = worldToTable(table, shooter.position);
		// Cue ball near the foot end: the shooter stands beyond the foot rail.
		expect(local.x).toBeGreaterThan(TABLE_OUTER.x);
		const cue = tableToWorld(table, { x: 0.9, y: 0.1 });
		const heading = Math.atan2(cue.x - shooter.position.x, cue.z - shooter.position.z);
		expect(shooter.rotationY).toBeCloseTo(heading);
		const others = ["nora", "mika"].map((name) => spots.get(name)?.position);
		for (const spot of others) {
			if (!spot) throw new Error("missing onlooker spot");
			const at = worldToTable(table, spot);
			expect(Math.abs(at.x) > TABLE_OUTER.x || Math.abs(at.y) > TABLE_OUTER.y).toBe(true);
			expect(Math.hypot(spot.x - shooter.position.x, spot.z - shooter.position.z)).toBeGreaterThan(
				0.5,
			);
		}
		expect(others[0]).not.toEqual(others[1]);
	});
});
