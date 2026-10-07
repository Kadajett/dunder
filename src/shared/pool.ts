import type { Unsubscribe } from "./screens";

/**
 * Table coordinates, in metres: the origin is the centre of the playing
 * surface, +x points to the foot rail (the rack end), +y is 90° counter-clockwise
 * from +x. The surface is the rectangle inside the cushion noses. Angles are
 * degrees in the same frame; 0° shoots toward +x.
 */
export const POOL_TABLE = {
	length: 2.24,
	width: 1.12,
	ballRadius: 0.028575,
	/** A corner pocket's jaws sit this far from the corner along each rail. */
	cornerJaw: 0.08,
	/** A side pocket's jaws sit this far either side of the middle of the long rail. */
	sideJaw: 0.062,
} as const;

/** Behind this line (x ≤ it) is the kitchen, where the cue ball goes for a break. */
export const HEAD_STRING_X = -POOL_TABLE.length / 4;
export const FOOT_SPOT = { x: POOL_TABLE.length / 4, y: 0 } as const;
export const HEAD_SPOT = { x: HEAD_STRING_X, y: 0 } as const;

/** t/b = the +y/−y long rail, l/m/r = head end, middle, foot end. */
export const POCKET_IDS = ["tl", "tm", "tr", "bl", "bm", "br"] as const;
export type PocketId = (typeof POCKET_IDS)[number];

/** Where each pocket's opening meets the surface: the corner, or the middle of the long rail. */
export const POCKETS: Readonly<Record<PocketId, { readonly x: number; readonly y: number }>> = {
	tl: { x: -POOL_TABLE.length / 2, y: POOL_TABLE.width / 2 },
	tm: { x: 0, y: POOL_TABLE.width / 2 },
	tr: { x: POOL_TABLE.length / 2, y: POOL_TABLE.width / 2 },
	bl: { x: -POOL_TABLE.length / 2, y: -POOL_TABLE.width / 2 },
	bm: { x: 0, y: -POOL_TABLE.width / 2 },
	br: { x: POOL_TABLE.length / 2, y: -POOL_TABLE.width / 2 },
};

/** 0 is the cue ball; 1-7 solids, 8 the black, 9-15 stripes (same colours as 1-7 with a white band). */
export const CUE_BALL = 0;
export const EIGHT_BALL = 8;
export const BALL_IDS = Array.from({ length: 16 }, (_, id) => id);

export type PoolGroup = "solids" | "stripes";

export function groupOf(id: number): PoolGroup | undefined {
	if (id >= 1 && id <= 7) return "solids";
	if (id >= 9 && id <= 15) return "stripes";
	return undefined;
}

/** Base colour per ball number; a stripe uses its number minus 8. */
export const BALL_COLORS: Readonly<Record<number, string>> = {
	0: "#f4f1e8",
	1: "#f2c418",
	2: "#1f4fbf",
	3: "#d42a2a",
	4: "#5b2a86",
	5: "#ef7a1a",
	6: "#1f7a3a",
	7: "#7a2b1f",
	8: "#16161a",
};

export interface PoolBall {
	readonly id: number;
	readonly x: number;
	readonly y: number;
	/** The pocket it dropped into; null while it is on the table. */
	readonly pocket: PocketId | null;
}

export interface PoolSide {
	readonly players: readonly string[];
	readonly group: PoolGroup | null;
	/** Ids of the side's group balls still on the table (empty while the table is open). */
	readonly left: readonly number[];
}

export type PoolBallInHand = "kitchen" | "anywhere";

/**
 * Where ball in hand may put the cue ball: on the cloth, clear of every ball,
 * behind the head string for a kitchen. The engine's rule; table view mirrors it.
 */
export function canPlaceCue(
	balls: readonly PoolBall[],
	spot: { readonly x: number; readonly y: number },
	area: PoolBallInHand,
): boolean {
	const r = POOL_TABLE.ballRadius;
	if (!Number.isFinite(spot.x) || !Number.isFinite(spot.y)) return false;
	if (Math.abs(spot.x) > POOL_TABLE.length / 2 - r || Math.abs(spot.y) > POOL_TABLE.width / 2 - r) {
		return false;
	}
	if (area === "kitchen" && spot.x > HEAD_STRING_X) return false;
	return balls.every(
		(ball) =>
			ball.pocket !== null ||
			ball.id === CUE_BALL ||
			Math.hypot(ball.x - spot.x, ball.y - spot.y) >= 2 * r,
	);
}

export interface PoolShotReport {
	readonly by: string;
	/** One line, e.g. 'nora: potted 12, 9 · stripes continue'. */
	readonly text: string;
}

export interface PoolResult {
	/** The winning side, or null for a draw. */
	readonly winner: number | null;
	readonly players: readonly string[];
	readonly reason: string;
}

/** Everything the scene, the HUD and `office-pool state` show; main owns it. */
export interface PoolView {
	/** resting: no game; playing: a game or practice is on; finished: the winner pause. */
	readonly stage: "resting" | "playing" | "finished";
	readonly mode: "game" | "practice" | null;
	readonly balls: readonly PoolBall[];
	/** Two sides in a game, one in practice, none while resting. */
	readonly sides: readonly PoolSide[];
	readonly turn: number | null;
	readonly shooter: string | null;
	readonly ballInHand: PoolBallInHand | null;
	/** The shooter's side has cleared its group: the next shot needs a called pocket. */
	readonly onEight: boolean;
	/** True while a struck shot is still rolling; `PoolFrame`s carry the positions. */
	readonly moving: boolean;
	/** Counts shots taken this game; frames name the shot they belong to. */
	readonly shot: number;
	/** Eligible agents waiting for a seat, longest-waiting first. */
	readonly queue: readonly string[];
	readonly last: PoolShotReport | null;
	/** The latest shot reports, newest last. */
	readonly recent: readonly PoolShotReport[];
	readonly result: PoolResult | null;
	readonly jeremy: {
		readonly joined: boolean;
		readonly viewing: boolean;
		readonly yourTurn: boolean;
	};
	/** The in-world label over the table; empty while the table rests. */
	readonly label: string;
}

/** Ball positions during a shot, about 30 per second. */
export interface PoolFrame {
	readonly shot: number;
	/** Seconds since the cue ball was struck. */
	readonly t: number;
	/** [id, x, y] for every ball still on the table. */
	readonly balls: readonly (readonly [number, number, number])[];
}

export interface PoolShotInput {
	readonly angle: number;
	/** 0-1 of the hardest shot; must be above 0. */
	readonly power: number;
	/** Where the cue ball goes, only with ball in hand. */
	readonly cue?: { readonly x: number; readonly y: number };
	/** Required when shooting at the 8. */
	readonly calledPocket?: PocketId;
}

export type PoolActionResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly reason: string };

/** Jeremy's player name; an agent with the same name never takes a seat (names would clash). */
export const JEREMY = "Jeremy";

export interface PoolApi {
	get(): Promise<PoolView>;
	onChanged(listener: (view: PoolView) => void): Unsubscribe;
	onFrame(listener: (frame: PoolFrame) => void): Unsubscribe;
	/** Join the running game (side with fewer players), or start practice when the table rests. */
	join(): Promise<PoolActionResult>;
	/** Leave the game or end practice; an emptied side forfeits. */
	leave(): Promise<PoolActionResult>;
	/** Whether Jeremy is in table view: out of it, autopilot plays his visits. */
	setViewing(viewing: boolean): Promise<void>;
	shoot(input: PoolShotInput): Promise<PoolActionResult>;
}
