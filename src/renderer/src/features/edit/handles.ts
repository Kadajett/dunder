import type { ItemRef } from "@shared/layout/ops";
import type { DecorKind, Layout } from "@shared/layout/schema";
import { DEG, deskToWorld, STATION_SCALE } from "../office/scene/station";

/** Mutable so it can feed three.js tuple props directly. */
type Vec3 = [number, number, number];

/** An edit-mode pick box: what you click and drag to move an item. */
export interface HandleBox {
	readonly center: Vec3;
	/** Width (local x), height, depth (local z). */
	readonly size: Vec3;
	/** Radians around +y. */
	readonly rotationY: number;
}

/** Rough footprint (w × h × d, metres) of each decor kind; wall kinds hang centred on `elevation`. */
const DECOR_SIZE: Record<DecorKind, Vec3> = {
	plant: [0.9, 1.5, 0.9],
	"tall-plant": [1.1, 2.3, 1.1],
	bookshelf: [2.2, 2.2, 0.6],
	sofa: [2.2, 0.95, 1],
	armchair: [1, 0.95, 1],
	"coffee-table": [1.3, 0.5, 0.8],
	"reception-desk": [2.4, 1.15, 1],
	"server-rack": [0.9, 2.1, 1],
	"wall-bell": [0.6, 0.6, 0.3],
	"wall-clock": [0.8, 0.8, 0.15],
	"floor-lamp": [0.5, 1.8, 0.5],
	"mail-cubby": [1.7, 1.7, 0.6],
	"notice-board": [1.5, 2.1, 0.4],
	"water-cooler": [0.55, 1.35, 0.55],
	printer: [0.9, 1, 0.7],
	"wall-tv": [2.2, 1.3, 0.15],
	"wall-placard": [1.5, 0.9, 0.1],
	whiteboard: [2.3, 1.3, 0.14],
};

const WALL_KINDS: Partial<Record<DecorKind, true>> = {
	"wall-bell": true,
	"wall-clock": true,
	"wall-tv": true,
	"wall-placard": true,
	whiteboard: true,
};

/** Every editable item, in draw order. */
export function editableItems(layout: Layout): ItemRef[] {
	return [
		...layout.zones.map((item) => ({ kind: "zone", id: item.id }) as const),
		...layout.desks.map((item) => ({ kind: "desk", id: item.id }) as const),
		...layout.decor.map((item) => ({ kind: "decor", id: item.id }) as const),
		...layout.callouts.map((item) => ({ kind: "callout", id: item.id }) as const),
	];
}

function decorBox(layout: Layout, id: string): HandleBox | undefined {
	const item = layout.decor.find((decor) => decor.id === id);
	if (!item) return undefined;
	const size = DECOR_SIZE[item.kind];
	const rotationY = item.rotation * DEG;
	const { x, z } = item.position;
	if (!WALL_KINDS[item.kind]) {
		return { center: [x, item.elevation + size[1] / 2, z], size, rotationY };
	}
	// Wall kinds have their back plane at local z = 0.
	const half = size[2] / 2;
	const center: Vec3 = [
		x + Math.sin(rotationY) * half,
		item.elevation,
		z + Math.cos(rotationY) * half,
	];
	return { center, size, rotationY };
}

/** The pick box of an item, or undefined if it isn't in the layout (or has nothing to grab). */
export function handleBox(layout: Layout, ref: ItemRef): HandleBox | undefined {
	switch (ref.kind) {
		case "desk": {
			const desk = layout.desks.find((item) => item.id === ref.id);
			if (!desk) return undefined;
			// Desk and monitor, not the chair: a seated agent stays clickable.
			const { x, z } = deskToWorld(desk, { x: 0, z: 0.02 });
			const size: Vec3 = [1.6 * STATION_SCALE, 1.3 * STATION_SCALE, 0.95 * STATION_SCALE];
			return { center: [x, size[1] / 2, z], size, rotationY: desk.rotation * DEG };
		}
		case "decor":
			return decorBox(layout, ref.id);
		case "zone": {
			const rug = layout.zones.find((item) => item.id === ref.id)?.rug;
			if (!rug) return undefined;
			return {
				center: [rug.center.x, 0.03, rug.center.z],
				size: [rug.width, 0.06, rug.depth],
				rotationY: 0,
			};
		}
		case "callout": {
			const callout = layout.callouts.find((item) => item.id === ref.id);
			if (!callout) return undefined;
			const { x, z } = callout.position;
			// A post from the floor up to the floating card.
			return {
				center: [x, callout.height / 2, z],
				size: [0.35, callout.height, 0.35],
				rotationY: 0,
			};
		}
	}
}
