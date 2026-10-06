import {
	CUE_RACK_DECOR,
	DEFAULT_LAYOUT,
	MIGRATION,
	POOL_TABLE_DECOR,
	SALES_RUG,
	WHITEBOARD,
} from "./default-layout";
import type { Callout, Decor, Desk, Layout, Zone } from "./schema";

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

type Rug = NonNullable<Zone["rug"]>;

/** Where the sales floor and its desks stood before office-miz moved them toward the TV. */
const FORMER_SALES_RUG = { center: { x: -6.6, z: 3.4 }, width: 7.6, depth: 7.4 } as const;
const FORMER_SALES_DESKS: Readonly<Record<string, { x: number; z: number }>> = {
	"sales-1": { x: -8.3, z: 2 },
	"sales-2": { x: -5.2, z: 2 },
	"sales-3": { x: -6.8, z: 5.2 },
};

/** The server rack's callout as shipped; nobody knew what it was for (office-miz). */
const FORMER_ACCESS = {
	id: "access",
	title: "ACCESS",
	subtitle: "herdr · office session",
	position: { x: 11.6, z: -5.4 },
} as const;

function untouchedRug(rug: Rug): boolean {
	const former = FORMER_SALES_RUG;
	return (
		rug.center.x === former.center.x &&
		rug.center.z === former.center.z &&
		rug.width === former.width &&
		rug.depth === former.depth
	);
}

function untouchedDesk(desk: Desk): boolean {
	const former = FORMER_SALES_DESKS[desk.id];
	return former !== undefined && desk.position.x === former.x && desk.position.z === former.z;
}

/**
 * The sales zone and its desks at their new defaults, if the user never moved,
 * resized or added to them; otherwise the layout is theirs and stays.
 */
function moveSalesTowardTv(layout: Layout): Pick<Layout, "zones" | "desks"> {
	const sales = layout.zones.find((zone) => zone.id === "sales");
	const rug = sales?.rug;
	const members = layout.desks.filter((desk) => desk.zoneId === "sales");
	if (!rug || !untouchedRug(rug) || !members.every(untouchedDesk)) return layout;
	const moved: Rug = { ...SALES_RUG, color: rug.color };
	const defaults = new Map(DEFAULT_LAYOUT.desks.map((desk) => [desk.id, desk.position]));
	return {
		zones: layout.zones.map((zone) => (zone === sales ? { ...zone, rug: moved } : zone)),
		desks: layout.desks.map((desk) => {
			const position = desk.zoneId === "sales" ? defaults.get(desk.id) : undefined;
			return position ? { ...desk, position } : desk;
		}),
	};
}

function untouchedAccess(callout: Callout): boolean {
	const former = FORMER_ACCESS;
	return (
		callout.id === former.id &&
		callout.title === former.title &&
		callout.subtitle === former.subtitle &&
		callout.position.x === former.position.x &&
		callout.position.z === former.position.z
	);
}

/**
 * office-miz, once per layout: the sales floor moves toward the TV and off the
 * break-room rug, and the server rack's ACCESS callout goes, each only if the
 * user left it as it was.
 */
function salesNearTv(layout: Layout): Layout {
	if (layout.migrations.includes(MIGRATION.salesNearTv)) return layout;
	return {
		...layout,
		...moveSalesTowardTv(layout),
		callouts: layout.callouts.filter((callout) => !untouchedAccess(callout)),
		migrations: [...layout.migrations, MIGRATION.salesNearTv],
	};
}

/** `item`, renamed if its id is already used in `decor`. */
function withFreeId(item: Decor, decor: readonly Decor[]): Decor {
	return decor.some((other) => other.id === item.id) ? { ...item, id: `${item.id}-room` } : item;
}

/**
 * office-hgr.3, once per layout: hang the whiteboard by the couches unless the
 * layout already has one. Once done, a board Jeremy deletes stays deleted.
 */
function hangWhiteboard(layout: Layout): Layout {
	if (layout.migrations.includes(MIGRATION.whiteboard)) return layout;
	const hasBoard = layout.decor.some((item) => item.kind === "whiteboard");
	return {
		...layout,
		decor: hasBoard ? layout.decor : [...layout.decor, withFreeId(WHITEBOARD, layout.decor)],
		migrations: [...layout.migrations, MIGRATION.whiteboard],
	};
}

/** The clients lounge as shipped: two armchairs and a coffee table (office-dk7.2 replaced it). */
const FORMER_LOUNGE: readonly Pick<Decor, "id" | "kind" | "position">[] = [
	{ id: "crm-armchair-1", kind: "armchair", position: { x: -11.8, z: -1.6 } },
	{ id: "crm-armchair-2", kind: "armchair", position: { x: -11.8, z: -4.2 } },
	{ id: "crm-table", kind: "coffee-table", position: { x: -10.2, z: -2.9 } },
];

function untouchedLounge(item: Decor): boolean {
	return FORMER_LOUNGE.some(
		(former) =>
			item.id === former.id &&
			item.kind === former.kind &&
			item.position.x === former.position.x &&
			item.position.z === former.position.z,
	);
}

/**
 * office-dk7.2, once per layout: the lounge pieces still where they shipped
 * go, and the pool table and its cue rack arrive unless the layout has them.
 * Pieces Jeremy moved stay; once done, a table he deletes stays deleted.
 */
function poolTableForLounge(layout: Layout): Layout {
	if (layout.migrations.includes(MIGRATION.poolTable)) return layout;
	const kept = layout.decor.filter((item) => !untouchedLounge(item));
	const has = (kind: Decor["kind"]): boolean => kept.some((item) => item.kind === kind);
	const added = [
		...(has("pool-table") ? [] : [withFreeId(POOL_TABLE_DECOR, kept)]),
		...(has("cue-rack") ? [] : [withFreeId(CUE_RACK_DECOR, kept)]),
	];
	return {
		...layout,
		decor: [...kept, ...added],
		migrations: [...layout.migrations, MIGRATION.poolTable],
	};
}

/**
 * Bring a saved layout up to date with changed defaults. Companies copy the
 * default layout when created, so a value still on its former default was
 * never chosen by anyone: it moves to the current default on its own (floor
 * colour, wall height). Any other value is kept. Moves that must not undo a
 * later edit run once, recorded in `layout.migrations`.
 */
export function migrateLayout(layout: Layout): Layout {
	const room = migrateRoom(layout.room);
	const dropped = labelOnlyZones(layout);
	const current =
		room === layout.room && dropped.size === 0
			? layout
			: { ...layout, room, zones: layout.zones.filter((zone) => !dropped.has(zone)) };
	return poolTableForLounge(hangWhiteboard(salesNearTv(current)));
}
