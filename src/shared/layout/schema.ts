import { z } from "zod";

/**
 * Office layout model. World units are roughly metres, y is up, the origin is
 * the centre of the floor. The camera looks from +x/+z, so the two walls are
 * the "left" wall (plane x = -width/2, facing +x) and the "right" wall
 * (plane z = -depth/2, facing +z). Rotations are degrees around +y; an
 * object's front faces local +z at rotation 0.
 */
export const vec2Schema = z.object({ x: z.number(), z: z.number() });
export type Vec2 = z.infer<typeof vec2Schema>;

export const decorKinds = [
	"plant",
	"tall-plant",
	"bookshelf",
	"sofa",
	"armchair",
	"coffee-table",
	"reception-desk",
	"server-rack",
	"wall-bell",
	"wall-clock",
	"floor-lamp",
	"mail-cubby",
	"notice-board",
	"water-cooler",
	"printer",
	"wall-tv",
	"wall-placard",
] as const;
export type DecorKind = (typeof decorKinds)[number];

export const wallSchema = z.enum(["left", "right"]);
export type Wall = z.infer<typeof wallSchema>;

export const windowSchema = z.object({
	wall: wallSchema,
	/** Distance of the window centre from the shared back corner, along the wall. */
	offset: z.number(),
	width: z.number().positive(),
	height: z.number().positive(),
	sill: z.number().nonnegative(),
});
export type WindowSpec = z.infer<typeof windowSchema>;

export const roomSchema = z.object({
	width: z.number().positive(),
	depth: z.number().positive(),
	wallHeight: z.number().positive(),
	floorColor: z.string(),
	wallColor: z.string(),
	windows: z.array(windowSchema),
	/** Company sign painted on the right wall. */
	sign: z.object({ title: z.string(), subtitle: z.string(), offset: z.number() }),
});
export type Room = z.infer<typeof roomSchema>;

/**
 * A named area of the office: a rug, and the desks that seat one herdr
 * workspace's agents. Its title shows in edit mode and Classic view, not in the
 * office. Unknown keys are stripped, so layouts saved with the former label
 * fields (`subtitle`, `labelAt`, `labelHeight`, `labelMode`) still load.
 */
export const zoneSchema = z.object({
	id: z.string(),
	title: z.string(),
	/** herdr workspace label whose agents belong at this zone's desks. */
	workspaceLabel: z.string().optional(),
	rug: z
		.object({ center: vec2Schema, width: z.number(), depth: z.number(), color: z.string() })
		.optional(),
});
export type Zone = z.infer<typeof zoneSchema>;

export const deskSchema = z.object({
	id: z.string(),
	position: vec2Schema,
	rotation: z.number(),
	zoneId: z.string().optional(),
	/** Pin a specific herdr agent (by live name) to this desk. */
	agentName: z.string().optional(),
	/** A desk for the human (e.g. "your desk"); never auto-assigned to an agent. */
	reserved: z.boolean().default(false),
	chairColor: z.string().default("#3d4a5c"),
});
export type Desk = z.infer<typeof deskSchema>;

export const decorSchema = z.object({
	id: z.string(),
	kind: z.enum(decorKinds),
	position: vec2Schema,
	rotation: z.number().default(0),
	/** Height above the floor, for wall-mounted items. */
	elevation: z.number().default(0),
	label: z.string().optional(),
});
export type Decor = z.infer<typeof decorSchema>;

export const calloutSchema = z.object({
	id: z.string(),
	title: z.string(),
	subtitle: z.string().optional(),
	position: vec2Schema,
	height: z.number(),
	tone: z.enum(["light", "dark", "accent"]).default("light"),
});
export type Callout = z.infer<typeof calloutSchema>;

export const layoutSchema = z.object({
	version: z.literal(1),
	room: roomSchema,
	zones: z.array(zoneSchema),
	desks: z.array(deskSchema),
	decor: z.array(decorSchema),
	callouts: z.array(calloutSchema),
	/**
	 * One-time migrations already applied (see `migrateLayout`), so a change the
	 * user undid after it ran is never re-applied. Layouts saved before the
	 * first marked migration load with none.
	 */
	migrations: z.array(z.string()).default([]),
});
export type Layout = z.infer<typeof layoutSchema>;
