import { type Layout, layoutSchema, type Zone } from "./schema";

/**
 * The starter office, modelled on docs/reference/orpex-office.png: a long
 * right wall with the company sign, windows on the left wall, a sales and a
 * delivery floor bound to herdr workspaces, and the usual company corners.
 * Room spans x ∈ [-13, 13], z ∈ [-10, 10]; the back corner is (-13, -10).
 */
export const DEFAULT_LAYOUT: Layout = layoutSchema.parse({
	version: 1,
	room: {
		width: 26,
		depth: 20,
		// Low enough that the floor dominates as in the reference; the wall TV (top at 3.645) still fits.
		wallHeight: 3.7,
		floorColor: "#c8b28b",
		wallColor: "#f1e5cc",
		windows: [
			{ wall: "left", offset: 3.2, width: 3.2, height: 1.1, sill: 2.4 },
			{ wall: "left", offset: 8.2, width: 3.2, height: 1.1, sill: 2.4 },
			{ wall: "left", offset: 13.2, width: 3.2, height: 1.1, sill: 2.4 },
			{ wall: "left", offset: 17.6, width: 2.6, height: 1.1, sill: 2.4 },
			{ wall: "right", offset: 21.5, width: 3.4, height: 1.8, sill: 1.4 },
		],
		sign: { title: "DUNDER MIFFLIN", subtitle: "SCRANTON BRANCH · RUNS ON DUNDER", offset: 13.2 },
	},
	// Zones are rugs and desk groups; the office shows no label for them (office-72z).
	zones: [
		{
			id: "sales",
			title: "#SALES",
			workspaceLabel: "sales",
			rug: { center: { x: -6.6, z: 3.4 }, width: 7.6, depth: 7.4, color: "#b9a58a" },
		},
		{
			id: "delivery",
			title: "#DELIVERY",
			workspaceLabel: "delivery",
			rug: { center: { x: 2.6, z: -4.4 }, width: 9.6, depth: 6.6, color: "#a9b48f" },
		},
		{
			id: "you",
			title: "YOUR DESK",
			rug: { center: { x: 7.6, z: 2.4 }, width: 5.4, depth: 4.8, color: "#9fb69a" },
		},
		{
			id: "break-room",
			title: "BREAK ROOM",
			rug: { center: { x: -10.2, z: 6.4 }, width: 5, depth: 5.6, color: "#c9a7a0" },
		},
	],
	// Few stations, mostly filled, as in the reference: a staggered sales pod, a
	// 2 × 2 delivery block and one shared desk for agents from other workspaces.
	// Edit mode adds desks as the team grows.
	desks: [
		{
			id: "sales-1",
			position: { x: -8.3, z: 2 },
			rotation: 0,
			zoneId: "sales",
			chairColor: "#2f5d63",
		},
		{
			id: "sales-2",
			position: { x: -5.2, z: 2 },
			rotation: 0,
			zoneId: "sales",
			chairColor: "#5d3f6a",
		},
		{
			id: "sales-3",
			position: { x: -6.8, z: 5.2 },
			rotation: 0,
			zoneId: "sales",
			chairColor: "#2f5d63",
		},
		{
			id: "delivery-1",
			position: { x: 0.4, z: -5.6 },
			rotation: 0,
			zoneId: "delivery",
			chairColor: "#3d4a5c",
		},
		{
			id: "delivery-2",
			position: { x: 3.9, z: -5.6 },
			rotation: 0,
			zoneId: "delivery",
			chairColor: "#3d4a5c",
		},
		{
			id: "delivery-3",
			position: { x: 0.4, z: -2.4 },
			rotation: 0,
			zoneId: "delivery",
			chairColor: "#2f6b4c",
		},
		{
			id: "delivery-4",
			position: { x: 3.9, z: -2.4 },
			rotation: 0,
			zoneId: "delivery",
			chairColor: "#2f6b4c",
		},
		{ id: "open-1", position: { x: 1.2, z: 4 }, rotation: 90, chairColor: "#6b4f3a" },
		{
			id: "your-desk",
			position: { x: 7.6, z: 2.6 },
			rotation: 0,
			zoneId: "you",
			reserved: true,
			chairColor: "#24272c",
		},
		{
			id: "chief-desk",
			position: { x: 5.5, z: 2.6 },
			rotation: 0,
			zoneId: "you",
			agentName: "max",
			reserved: true,
			chairColor: "#2f6b4c",
		},
	],
	decor: [
		{ id: "sofa", kind: "sofa", position: { x: -12.2, z: 6.4 }, rotation: 90 },
		{ id: "break-table", kind: "coffee-table", position: { x: -10.4, z: 6.4 } },
		{ id: "break-armchair", kind: "armchair", position: { x: -9.6, z: 8.6 }, rotation: 200 },
		{ id: "break-lamp", kind: "floor-lamp", position: { x: -12.3, z: 8.8 } },
		{ id: "water-cooler", kind: "water-cooler", position: { x: -12.4, z: 3.6 }, rotation: 90 },
		{ id: "crm-armchair-1", kind: "armchair", position: { x: -11.8, z: -1.6 }, rotation: 90 },
		{ id: "crm-armchair-2", kind: "armchair", position: { x: -11.8, z: -4.2 }, rotation: 90 },
		{ id: "crm-table", kind: "coffee-table", position: { x: -10.2, z: -2.9 } },
		{ id: "mail-cubby", kind: "mail-cubby", position: { x: -4.4, z: -9.6 } },
		{ id: "printer", kind: "printer", position: { x: -2.4, z: -9.5 } },
		{ id: "shelf-1", kind: "bookshelf", position: { x: 3.6, z: -9.7 } },
		{ id: "shelf-2", kind: "bookshelf", position: { x: 5.8, z: -9.7 } },
		{ id: "shelf-3", kind: "bookshelf", position: { x: 8, z: -9.7 } },
		{ id: "server-rack", kind: "server-rack", position: { x: 11.6, z: -5.4 }, rotation: -90 },
		{ id: "reception", kind: "reception-desk", position: { x: 5.4, z: 7.4 } },
		// Turned toward the camera (which looks from +x/+z), so its front faces the viewer.
		{ id: "open-roles", kind: "notice-board", position: { x: 8.6, z: 8.2 }, rotation: 35 },
		{
			id: "bell",
			kind: "wall-bell",
			position: { x: -11.6, z: -10 },
			elevation: 2.9,
			label: "AGENT BELL",
		},
		{ id: "spend-placard", kind: "wall-placard", position: { x: -9.4, z: -10 }, elevation: 2.8 },
		{ id: "tv", kind: "wall-tv", position: { x: -6.6, z: -10 }, elevation: 2.9 },
		{ id: "clock", kind: "wall-clock", position: { x: 9.6, z: -10 }, elevation: 3 },
		{ id: "plant-1", kind: "plant", position: { x: -11.8, z: 0.8 } },
		{ id: "plant-2", kind: "plant", position: { x: -10.6, z: 9.2 } },
		{ id: "plant-3", kind: "plant", position: { x: -2.8, z: 9 } },
		{ id: "plant-4", kind: "plant", position: { x: 10.4, z: 8.6 } },
		{ id: "plant-5", kind: "plant", position: { x: 4.4, z: 5.2 } },
		{ id: "plant-6", kind: "tall-plant", position: { x: -6.2, z: -9.3 } },
		{ id: "plant-7", kind: "tall-plant", position: { x: 12.2, z: -9.2 } },
		{ id: "plant-8", kind: "plant", position: { x: -12.2, z: -8.8 } },
	],
	callouts: [
		{
			id: "access",
			title: "ACCESS",
			subtitle: "herdr · office session",
			position: { x: 11.6, z: -5.4 },
			height: 2.6,
		},
	],
});

/** The default floor before it was matched to the reference (office-vl9.6). */
const FORMER_DEFAULT_FLOOR = "#cfa979";
/** The default wall height before it was lowered toward the reference (office-vl9.7). */
const FORMER_DEFAULT_WALL_HEIGHT = 4.2;

function migrateRoom(room: Layout["room"]): Layout["room"] {
	const floorColor =
		room.floorColor.toLowerCase() === FORMER_DEFAULT_FLOOR
			? DEFAULT_LAYOUT.room.floorColor
			: room.floorColor;
	const wallHeight =
		room.wallHeight === FORMER_DEFAULT_WALL_HEIGHT
			? DEFAULT_LAYOUT.room.wallHeight
			: room.wallHeight;
	if (floorColor === room.floorColor && wallHeight === room.wallHeight) return room;
	return { ...room, floorColor, wallHeight };
}

/**
 * Zones without a rug or desks (the former CLIENTS, MAILROOM, LIBRARY and
 * RECEPTION) existed only for their floating label. With labels gone they are
 * invisible and cannot be picked in edit mode, so they are dropped.
 */
function labelOnlyZones(layout: Layout): ReadonlySet<Zone> {
	const seated = new Set(layout.desks.flatMap((desk) => desk.zoneId ?? []));
	return new Set(layout.zones.filter((zone) => !zone.rug && !seated.has(zone.id)));
}

/**
 * Bring a saved layout up to date with changed defaults. Companies copy the
 * default layout when created, so a value still on its former default was
 * never chosen by anyone: it moves to the current default on its own (floor
 * colour, wall height). Any other value is kept.
 */
export function migrateLayout(layout: Layout): Layout {
	const room = migrateRoom(layout.room);
	const dropped = labelOnlyZones(layout);
	if (room === layout.room && dropped.size === 0) return layout;
	return { ...layout, room, zones: layout.zones.filter((zone) => !dropped.has(zone)) };
}
