import type { Callout, Decor, DecorKind, Desk, Layout, Vec2, Zone } from "./schema";

/**
 * Pure edit-mode operations on a layout. Every op returns a new layout (the
 * input is never mutated) that still satisfies `layoutSchema`; an op on an
 * unknown item returns the layout unchanged.
 */

export type ItemKind = "desk" | "decor" | "zone" | "callout";

export interface ItemRef {
	readonly kind: ItemKind;
	readonly id: string;
}

/** Grid that moved items snap to, in metres. */
export const SNAP = 0.25;

const ORIGIN: Vec2 = { x: 0, z: 0 };

/** Mounting height of wall kinds when first placed. */
const WALL_ELEVATION: Partial<Record<DecorKind, number>> = {
	"wall-bell": 2.9,
	"wall-clock": 3,
	"wall-tv": 2.9,
	"wall-placard": 2.8,
	// Low enough to clear the window sills (2.4 m), with the marker tray at hand height.
	whiteboard: 1.45,
	// Cues stand from hip to above head height, below the window sills.
	"cue-rack": 1.3,
};

/** `prefix-N` with the smallest N not used by any item of the layout. */
export function freshId(layout: Layout, prefix: string): string {
	const used = new Set<string>([
		...layout.zones.map((item) => item.id),
		...layout.desks.map((item) => item.id),
		...layout.decor.map((item) => item.id),
		...layout.callouts.map((item) => item.id),
	]);
	let n = 1;
	while (used.has(`${prefix}-${n}`)) n += 1;
	return `${prefix}-${n}`;
}

function snapWithin(value: number, min: number, max: number): number {
	const lo = Math.ceil(min / SNAP) * SNAP;
	const hi = Math.floor(max / SNAP) * SNAP;
	if (lo > hi) return (min + max) / 2 + 0;
	// `+ 0` turns -0 into 0 so saved JSON never carries "-0".
	return Math.min(hi, Math.max(lo, Math.round(value / SNAP) * SNAP)) + 0;
}

/** Snap a point to the grid, keeping a `halfW` × `halfD` footprint inside the room. */
export function snapInRoom(layout: Layout, at: Vec2, halfW = 0, halfD = 0): Vec2 {
	const w = Math.max(0, layout.room.width / 2 - halfW);
	const d = Math.max(0, layout.room.depth / 2 - halfD);
	return { x: snapWithin(at.x, -w, w), z: snapWithin(at.z, -d, d) };
}

export function addDesk(layout: Layout, at: Vec2 = ORIGIN): Layout {
	const desk: Desk = {
		id: freshId(layout, "desk"),
		position: snapInRoom(layout, at),
		rotation: 0,
		reserved: false,
		chairColor: "#3d4a5c",
	};
	return { ...layout, desks: [...layout.desks, desk] };
}

export function addDecor(layout: Layout, kind: DecorKind, at: Vec2 = ORIGIN): Layout {
	const decor: Decor = {
		id: freshId(layout, kind),
		kind,
		position: snapInRoom(layout, at),
		rotation: 0,
		elevation: WALL_ELEVATION[kind] ?? 0,
	};
	return { ...layout, decor: [...layout.decor, decor] };
}

export function addZone(layout: Layout, at: Vec2 = ORIGIN): Layout {
	const zone: Zone = {
		id: freshId(layout, "zone"),
		title: "NEW ZONE",
		rug: { center: snapInRoom(layout, at, 2, 1.5), width: 4, depth: 3, color: "#d9c7a5" },
	};
	return { ...layout, zones: [...layout.zones, zone] };
}

/** A free-standing floating label card (a layout callout). */
export function addLabel(layout: Layout, at: Vec2 = ORIGIN): Layout {
	const callout: Callout = {
		id: freshId(layout, "label"),
		title: "NEW LABEL",
		position: snapInRoom(layout, at),
		height: 2.4,
		tone: "light",
	};
	return { ...layout, callouts: [...layout.callouts, callout] };
}

/** Where an item stands on the floor: its position, or a zone's rug centre. */
export function itemPosition(layout: Layout, ref: ItemRef): Vec2 | undefined {
	switch (ref.kind) {
		case "desk":
			return layout.desks.find((item) => item.id === ref.id)?.position;
		case "decor":
			return layout.decor.find((item) => item.id === ref.id)?.position;
		case "callout":
			return layout.callouts.find((item) => item.id === ref.id)?.position;
		case "zone":
			return layout.zones.find((item) => item.id === ref.id)?.rug?.center;
	}
}

function moveZone(layout: Layout, zone: Zone, to: Vec2): Zone {
	if (!zone.rug) return zone;
	const center = snapInRoom(layout, to, zone.rug.width / 2, zone.rug.depth / 2);
	return { ...zone, rug: { ...zone.rug, center } };
}

/** Move an item to `to`, snapped to the grid and clamped inside the room (a zone moves its rug). */
export function moveItem(layout: Layout, ref: ItemRef, to: Vec2): Layout {
	const position = snapInRoom(layout, to);
	const at = <T extends { readonly id: string }>(item: T) => item.id === ref.id;
	switch (ref.kind) {
		case "desk":
			return { ...layout, desks: layout.desks.map((d) => (at(d) ? { ...d, position } : d)) };
		case "decor":
			return { ...layout, decor: layout.decor.map((d) => (at(d) ? { ...d, position } : d)) };
		case "callout":
			return {
				...layout,
				callouts: layout.callouts.map((c) => (at(c) ? { ...c, position } : c)),
			};
		case "zone":
			return { ...layout, zones: layout.zones.map((z) => (at(z) ? moveZone(layout, z, to) : z)) };
	}
}

/** Degrees normalised to [0, 360). */
export function normalizeDegrees(degrees: number): number {
	return ((degrees % 360) + 360) % 360;
}

function rotateZone(layout: Layout, zone: Zone): Zone {
	if (!zone.rug) return zone;
	const rug = { ...zone.rug, width: zone.rug.depth, depth: zone.rug.width };
	return moveZone(layout, { ...zone, rug }, rug.center);
}

/** Turn an item 90° (`1` = counter-clockwise seen from above, `-1` = clockwise). A zone's rug swaps its sides. */
export function rotateItem(layout: Layout, ref: ItemRef, direction: 1 | -1): Layout {
	const turn = (rotation: number) => normalizeDegrees(rotation + 90 * direction);
	switch (ref.kind) {
		case "desk":
			return {
				...layout,
				desks: layout.desks.map((d) =>
					d.id === ref.id ? { ...d, rotation: turn(d.rotation) } : d,
				),
			};
		case "decor":
			return {
				...layout,
				decor: layout.decor.map((d) =>
					d.id === ref.id ? { ...d, rotation: turn(d.rotation) } : d,
				),
			};
		case "zone":
			return {
				...layout,
				zones: layout.zones.map((z) => (z.id === ref.id ? rotateZone(layout, z) : z)),
			};
		case "callout":
			return layout;
	}
}

function withoutZone(desk: Desk): Desk {
	const { zoneId: _zone, ...rest } = desk;
	return rest;
}

/** Remove an item; deleting a zone unassigns its desks. */
export function deleteItem(layout: Layout, ref: ItemRef): Layout {
	const keep = <T extends { readonly id: string }>(item: T) => item.id !== ref.id;
	switch (ref.kind) {
		case "desk":
			return { ...layout, desks: layout.desks.filter(keep) };
		case "decor":
			return { ...layout, decor: layout.decor.filter(keep) };
		case "callout":
			return { ...layout, callouts: layout.callouts.filter(keep) };
		case "zone":
			return {
				...layout,
				zones: layout.zones.filter(keep),
				desks: layout.desks.map((d) => (d.zoneId === ref.id ? withoutZone(d) : d)),
			};
	}
}
