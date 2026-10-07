import {
	CUE_BALL,
	canPlaceCue,
	HEAD_SPOT,
	HEAD_STRING_X,
	POOL_TABLE,
	type PoolBall,
	type PoolBallInHand,
} from "@shared/pool";
import type { TablePoint } from "./table-space";

const R = POOL_TABLE.ballRadius;
/** Where a ball centre meets a cushion (pocket openings ignored). */
const CUSHION = { x: POOL_TABLE.length / 2 - R, y: POOL_TABLE.width / 2 - R } as const;

/** A full pull-back this long (table metres, against the aim) strikes at full power. */
export const MAX_PULL_METRES = 0.45;
/** Releasing below this power cancels the shot instead of tapping the ball. */
export const MIN_SHOT_POWER = 0.02;

/** Degrees, counter-clockwise from table +x: the engine's shot angle from `from` toward `to`. */
export function angleTo(from: TablePoint, to: TablePoint): number {
	return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function direction(angle: number): TablePoint {
	const radians = (angle * Math.PI) / 180;
	return { x: Math.cos(radians), y: Math.sin(radians) };
}

/** 0-1: how far the pointer has been pulled back from `press`, against the aim, of a full pull. */
export function pullPower(press: TablePoint, pointer: TablePoint, angle: number): number {
	const aim = direction(angle);
	const back = -((pointer.x - press.x) * aim.x + (pointer.y - press.y) * aim.y);
	return Math.min(1, Math.max(0, back / MAX_PULL_METRES));
}

/** Where the cue ball's straight path first stops: touching a ball, or at a cushion. */
export type Contact =
	| { readonly kind: "ball"; readonly id: number; readonly at: TablePoint }
	| { readonly kind: "cushion"; readonly at: TablePoint };

/** Travel along `aim` from `from` until the centres are 2R apart; null when the path misses. */
function travelToBall(from: TablePoint, aim: TablePoint, ball: PoolBall): number | null {
	const dx = ball.x - from.x;
	const dy = ball.y - from.y;
	const along = dx * aim.x + dy * aim.y;
	if (along <= 0) return null;
	const miss2 = dx * dx + dy * dy - along * along;
	const reach2 = 4 * R * R;
	if (miss2 > reach2) return null;
	return Math.max(0, along - Math.sqrt(reach2 - miss2));
}

/** Travel along one axis to the cushion line ahead (Infinity when moving parallel to it). */
function travelToCushion(from: number, step: number, limit: number): number {
	if (step === 0) return Number.POSITIVE_INFINITY;
	return Math.max(0, ((step > 0 ? limit : -limit) - from) / step);
}

/**
 * Straight ray cast from the cue ball: the first object ball it would touch
 * (the ghost-ball spot), else the cushion line it reaches. No deflection.
 */
export function firstContact(cue: TablePoint, angle: number, balls: readonly PoolBall[]): Contact {
	const aim = direction(angle);
	const rail = Math.min(
		travelToCushion(cue.x, aim.x, CUSHION.x),
		travelToCushion(cue.y, aim.y, CUSHION.y),
	);
	let hit: { readonly id: number; readonly travel: number } | null = null;
	for (const ball of balls) {
		if (ball.pocket !== null || ball.id === CUE_BALL) continue;
		const travel = travelToBall(cue, aim, ball);
		if (travel !== null && travel < rail && (hit === null || travel < hit.travel)) {
			hit = { id: ball.id, travel };
		}
	}
	const travel = hit?.travel ?? rail;
	const at = { x: cue.x + aim.x * travel, y: cue.y + aim.y * travel };
	return hit ? { kind: "ball", id: hit.id, at } : { kind: "cushion", at };
}

/** Where to offer the cue ball with ball in hand: where it lies if that is legal, else a free head-end spot. */
export function startingCue(balls: readonly PoolBall[], area: PoolBallInHand): TablePoint {
	const cue = balls.find((ball) => ball.id === CUE_BALL && ball.pocket === null);
	const candidates = [
		...(cue ? [{ x: cue.x, y: cue.y }] : []),
		HEAD_SPOT,
		...[0.15, -0.15, 0.3, -0.3].map((y) => ({ x: HEAD_STRING_X - 4 * R, y })),
	];
	return candidates.find((spot) => canPlaceCue(balls, spot, area)) ?? HEAD_SPOT;
}
