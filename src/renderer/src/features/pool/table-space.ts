import type { Layout, Vec2 } from "@shared/layout/schema";
import { CUE_BALL, HEAD_SPOT, JEREMY, POOL_TABLE, type PoolView } from "@shared/pool";
import { DEG, type Placement, STATION_SCALE } from "../office/scene/station";

/**
 * Where the pool table stands: its decor item's centre and turn. Table space
 * is the engine's frame (metres on the cloth, origin at its centre, +x to the
 * foot rail, +y counter-clockwise); the decor draws it as local x = pool x,
 * local z = −pool y, scaled by STATION_SCALE like the desks.
 */
export interface TablePlacement {
	readonly center: Vec2;
	/** Radians around +y (the decor item's rotation). */
	readonly angle: number;
}

export interface TablePoint {
	readonly x: number;
	readonly y: number;
}

/** Cushion and wooden rail around the cloth, in table metres (matches the decor). */
const RIM = 0.05 + 0.12;
/** Half the table's outer size, in table metres. */
export const TABLE_OUTER = {
	x: POOL_TABLE.length / 2 + RIM,
	y: POOL_TABLE.width / 2 + RIM,
} as const;
/** How far from the rail players stand, in table metres (≈0.45 m in the room). */
const STAND_OFF = 0.36;
/** Where onlookers stand along the rails, in table metres; the shooter's spot bumps the nearest. */
const SLOTS: readonly TablePoint[] = [
	...[-0.75, 0, 0.75].flatMap((x) => [
		{ x, y: TABLE_OUTER.y + STAND_OFF },
		{ x, y: -(TABLE_OUTER.y + STAND_OFF) },
	]),
	{ x: TABLE_OUTER.x + STAND_OFF, y: 0 },
	{ x: -(TABLE_OUTER.x + STAND_OFF), y: 0 },
];
/** Onlookers keep at least this far from the shooter, in table metres. */
const ELBOW_ROOM = 0.6;

/** The office's pool table (the first `pool-table` decor item), or null when the layout has none. */
export function poolTableOf(layout: Layout): TablePlacement | null {
	const item = layout.decor.find((decor) => decor.kind === "pool-table");
	return item ? { center: item.position, angle: item.rotation * DEG } : null;
}

export function tableToWorld(table: TablePlacement, point: TablePoint): Vec2 {
	const lx = point.x * STATION_SCALE;
	const lz = -point.y * STATION_SCALE;
	const cos = Math.cos(table.angle);
	const sin = Math.sin(table.angle);
	return { x: table.center.x + lx * cos + lz * sin, z: table.center.z - lx * sin + lz * cos };
}

export function worldToTable(table: TablePlacement, world: Vec2): TablePoint {
	const dx = world.x - table.center.x;
	const dz = world.z - table.center.z;
	const cos = Math.cos(table.angle);
	const sin = Math.sin(table.angle);
	const lx = dx * cos - dz * sin;
	const lz = dx * sin + dz * cos;
	return { x: lx / STATION_SCALE, y: -lz / STATION_SCALE };
}

/** A standing spot at `point` (table space), turned to face `toward` (table space). */
function facing(table: TablePlacement, point: TablePoint, toward: TablePoint): Placement {
	const from = tableToWorld(table, point);
	const to = tableToWorld(table, toward);
	return { position: from, rotationY: Math.atan2(to.x - from.x, to.z - from.z) };
}

/** The point on the rail nearest `target`, pushed out to where a player stands. */
function besideRail(target: TablePoint): TablePoint {
	const clampX = Math.max(-TABLE_OUTER.x, Math.min(TABLE_OUTER.x, target.x));
	const clampY = Math.max(-TABLE_OUTER.y, Math.min(TABLE_OUTER.y, target.y));
	const options: TablePoint[] = [
		{ x: clampX, y: TABLE_OUTER.y + STAND_OFF },
		{ x: clampX, y: -(TABLE_OUTER.y + STAND_OFF) },
		{ x: TABLE_OUTER.x + STAND_OFF, y: clampY },
		{ x: -(TABLE_OUTER.x + STAND_OFF), y: clampY },
	];
	const gap = (p: TablePoint): number => Math.hypot(p.x - target.x, p.y - target.y);
	return options.reduce((best, option) => (gap(option) < gap(best) ? option : best));
}

/** Agents with a place at the table: seated in the game, and still there through the winner pause. */
export function poolPlayers(view: PoolView | null): string[] {
	if (!view || view.stage === "resting") return [];
	return view.sides.flatMap((side) => side.players).filter((name) => name !== JEREMY);
}

/**
 * Where each agent at the table stands: the shooter at the rail nearest the
 * cue ball, facing it; everyone else at a free slot along the rails, facing
 * the cloth. Agents not at the table get no spot.
 */
export function standingSpots(
	table: TablePlacement,
	view: PoolView | null,
): Map<string, Placement> {
	const spots = new Map<string, Placement>();
	if (!view) return spots;
	const cue = view.balls.find((ball) => ball.id === CUE_BALL && ball.pocket === null) ?? HEAD_SPOT;
	const shooterAt = besideRail(cue);
	const free = SLOTS.filter(
		(slot) => Math.hypot(slot.x - shooterAt.x, slot.y - shooterAt.y) >= ELBOW_ROOM,
	);
	let next = 0;
	for (const name of poolPlayers(view)) {
		if (name === view.shooter && view.stage === "playing") {
			spots.set(name, facing(table, shooterAt, cue));
			continue;
		}
		const slot = free[next % free.length] ?? SLOTS[0];
		next += 1;
		if (slot) spots.set(name, facing(table, slot, { x: slot.x * 0.5, y: 0 }));
	}
	return spots;
}
