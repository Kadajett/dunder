import {
	CUE_BALL,
	HEAD_STRING_X,
	POCKET_IDS,
	POCKETS,
	POOL_TABLE,
	type PocketId,
	type PoolBall,
	type PoolBallInHand,
	type PoolShotInput,
} from "@shared/pool";
import { MAX_SPEED, ROLL_DECEL } from "./physics";
import { canPlaceCue } from "./table";

const R = POOL_TABLE.ballRadius;
/** Cuts thinner than this (cosine of ~72°) miss too often to try. */
const MIN_CUT_COS = 0.3;
/** A side pocket only takes balls coming in this steeply (sine of the angle to the rail). */
const SIDE_ENTRY = 0.55;
/** The object ball should still roll this fast (m/s) when it reaches the pocket. */
const ARRIVAL_SPEED = 0.35;
/** Fraction of the cue ball's along-the-line speed an object ball keeps once rolling (physics: (1 + e)/2 × 5/7). */
const TRANSFER = 0.975 * (5 / 7);
const MAX_PLAY_POWER = 0.85;

interface Point {
	readonly x: number;
	readonly y: number;
}

/** A straight pot the AI can try: where the cue ball is, how to strike it, and how promising it looks. */
export interface PotLine {
	readonly input: PoolShotInput;
	readonly target: number;
	readonly pocket: PocketId;
	readonly score: number;
}

export const angleTo = (from: Point, to: Point): number =>
	(Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

function distanceToSegment(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length2 = dx * dx + dy * dy;
	const t =
		length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** No ball (other than the ones named) lies within two radii of the path. */
export function pathClear(
	balls: readonly PoolBall[],
	from: Point,
	to: Point,
	except: readonly number[],
): boolean {
	return balls.every(
		(ball) =>
			ball.pocket !== null ||
			except.includes(ball.id) ||
			distanceToSegment(ball, from, to) >= 2 * R,
	);
}

/** Power that rolls the cue ball `toGhost` metres, then sends the object ball `toPocket` metres at this cut. */
export function powerFor(toGhost: number, toPocket: number, cutCos: number): number {
	const objectSpeed = Math.sqrt(2 * ROLL_DECEL * toPocket + ARRIVAL_SPEED ** 2);
	const atContact = objectSpeed / (TRANSFER * cutCos);
	const speed = 1.15 * Math.sqrt(atContact ** 2 + 2 * ROLL_DECEL * toGhost);
	return Math.min(MAX_PLAY_POWER, Math.max(0.05, speed / MAX_SPEED));
}

/** The ghost-ball line from `cue` that pots `target` in `pocket`, or null when it's blocked or too thin. */
export function potLine(
	balls: readonly PoolBall[],
	cue: Point,
	target: PoolBall,
	pocket: PocketId,
): (Omit<PotLine, "input"> & { readonly angle: number; readonly power: number }) | null {
	const mouth = POCKETS[pocket];
	const toPocket = Math.hypot(mouth.x - target.x, mouth.y - target.y);
	const ux = (mouth.x - target.x) / toPocket;
	const uy = (mouth.y - target.y) / toPocket;
	if ((pocket === "tm" || pocket === "bm") && Math.abs(uy) < SIDE_ENTRY) return null;
	const ghost = { x: target.x - ux * 2 * R, y: target.y - uy * 2 * R };
	const toGhost = Math.hypot(ghost.x - cue.x, ghost.y - cue.y);
	if (toGhost < R) return null;
	const cutCos = ((ghost.x - cue.x) * ux + (ghost.y - cue.y) * uy) / toGhost;
	if (cutCos < MIN_CUT_COS) return null;
	if (!pathClear(balls, cue, ghost, [CUE_BALL, target.id])) return null;
	if (!pathClear(balls, target, mouth, [CUE_BALL, target.id])) return null;
	return {
		target: target.id,
		pocket,
		angle: angleTo(cue, ghost),
		power: powerFor(toGhost, toPocket, cutCos),
		score: cutCos ** 2 / (1 + toGhost + 1.5 * toPocket),
	};
}

/** Every pot line for the given targets, from the cue ball or, with ball in hand, from good spots for it. */
export function potLines(
	balls: readonly PoolBall[],
	targets: readonly number[],
	ballInHand: PoolBallInHand | null,
): PotLine[] {
	const cue = balls.find((ball) => ball.id === CUE_BALL && ball.pocket === null);
	return targets.flatMap((id) => {
		const target = balls.find((ball) => ball.id === id);
		if (!target) return [];
		return POCKET_IDS.flatMap((pocket) => {
			const spots = ballInHand ? cueSpots(balls, target, pocket, ballInHand) : cue ? [cue] : [];
			return spots.flatMap((spot) => {
				const line = potLine(balls, spot, target, pocket);
				if (!line) return [];
				const input: PoolShotInput = {
					angle: line.angle,
					power: line.power,
					...(ballInHand ? { cue: { x: spot.x, y: spot.y } } : {}),
				};
				return [{ input, target: line.target, pocket, score: line.score }];
			});
		});
	});
}

/** Ball-in-hand spots: straight behind the ghost ball, or along the head string for a kitchen. */
function cueSpots(
	balls: readonly PoolBall[],
	target: PoolBall,
	pocket: PocketId,
	area: PoolBallInHand,
): Point[] {
	const mouth = POCKETS[pocket];
	const length = Math.hypot(mouth.x - target.x, mouth.y - target.y);
	const ux = (mouth.x - target.x) / length;
	const uy = (mouth.y - target.y) / length;
	const behind = [0.15, 0.3].map((back) => ({
		x: target.x - ux * (2 * R + back),
		y: target.y - uy * (2 * R + back),
	}));
	const kitchen =
		area === "kitchen" ? [-0.4, -0.2, 0, 0.2, 0.4].map((y) => ({ x: HEAD_STRING_X - R, y })) : [];
	return [...behind, ...kitchen].filter((spot) => canPlaceCue(balls, spot, area));
}

/** Some legal spot for the cue ball, scanning the allowed area from its middle out. */
export function anySpot(balls: readonly PoolBall[], area: PoolBallInHand): Point {
	const xs =
		area === "kitchen" ? [-0.75, -0.65, -0.85, -0.95] : [-0.75, 0, 0.75, -0.4, 0.4, -0.95, 0.95];
	const ys = [0, 0.2, -0.2, 0.4, -0.4, 0.5, -0.5];
	const spots = xs.flatMap((x) => ys.map((y) => ({ x, y })));
	return spots.find((spot) => canPlaceCue(balls, spot, area)) ?? { x: HEAD_STRING_X - R, y: 0 };
}
