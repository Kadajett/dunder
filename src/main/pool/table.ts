import {
	CUE_BALL,
	EIGHT_BALL,
	FOOT_SPOT,
	HEAD_SPOT,
	POOL_TABLE,
	type PoolBall,
} from "@shared/pool";
import { nextRandom, shuffle } from "./rng";

const R = POOL_TABLE.ballRadius;
const HALF_L = POOL_TABLE.length / 2;
/** Racked balls sit this far apart so none starts overlapping a neighbour. */
const RACK_GAP = 0.0002;

/** Slots in rack order: apex first, rows of 1-5 toward the foot rail. */
function rackSlots(): { x: number; y: number }[] {
	const pitch = 2 * R + RACK_GAP;
	const rowStep = pitch * Math.cos(Math.PI / 6);
	return [0, 1, 2, 3, 4].flatMap((row) =>
		Array.from({ length: row + 1 }, (_, i) => ({
			x: FOOT_SPOT.x + row * rowStep,
			y: (i - row / 2) * pitch,
		})),
	);
}

const SLOTS = rackSlots();
const CENTRE_SLOT = 4;
const BACK_CORNERS = [10, 14] as const;

/**
 * A fresh rack: apex on the foot spot, the 8 in the centre, one solid and one
 * stripe in the back corners, the rest by seed. The cue ball waits on the head spot.
 */
export function rack(seed: number): { balls: PoolBall[]; seed: number } {
	const solids = shuffle([1, 2, 3, 4, 5, 6, 7], seed);
	const stripes = shuffle([9, 10, 11, 12, 13, 14, 15], solids.seed);
	const flip = nextRandom(stripes.seed);
	const [solid, ...restSolids] = solids.items;
	const [stripe, ...restStripes] = stripes.items;
	const corners = flip.value < 0.5 ? [solid, stripe] : [stripe, solid];
	const rest = shuffle([...restSolids, ...restStripes], flip.seed);
	const order: number[] = [];
	let next = 0;
	for (let slot = 0; slot < SLOTS.length; slot += 1) {
		if (slot === CENTRE_SLOT) order.push(EIGHT_BALL);
		else if (slot === BACK_CORNERS[0]) order.push(corners[0] ?? 0);
		else if (slot === BACK_CORNERS[1]) order.push(corners[1] ?? 0);
		else {
			order.push(rest.items[next] ?? 0);
			next += 1;
		}
	}
	const objects = order.map((id, slot) => ({ id, ...(SLOTS[slot] ?? FOOT_SPOT), pocket: null }));
	const cue: PoolBall = { id: CUE_BALL, ...HEAD_SPOT, pocket: null };
	return { balls: [cue, ...objects].sort((a, b) => a.id - b.id), seed: rest.seed };
}

export function onTable(balls: readonly PoolBall[]): PoolBall[] {
	return balls.filter((ball) => ball.pocket === null);
}

export function ballById(balls: readonly PoolBall[], id: number): PoolBall | undefined {
	return balls.find((ball) => ball.id === id);
}

function isFree(balls: readonly PoolBall[], x: number, y: number, except: number): boolean {
	return balls.every(
		(ball) =>
			ball.pocket !== null || ball.id === except || Math.hypot(ball.x - x, ball.y - y) >= 2 * R,
	);
}

/** Move one ball (placing it back on the table when it was potted). */
export function placeBall(
	balls: readonly PoolBall[],
	id: number,
	spot: { readonly x: number; readonly y: number },
): PoolBall[] {
	return balls.map((ball) => (ball.id === id ? { id, x: spot.x, y: spot.y, pocket: null } : ball));
}

/**
 * Re-spot the 8 on the foot spot; when that is taken, the nearest free point on
 * the line through it toward the foot rail, else toward the head.
 */
export function respotEight(balls: readonly PoolBall[]): PoolBall[] {
	const step = R / 4;
	const toFoot = Array.from(
		{ length: Math.floor((HALF_L - R - FOOT_SPOT.x) / step) + 1 },
		(_, i) => FOOT_SPOT.x + i * step,
	);
	const toHead = Array.from(
		{ length: Math.floor((FOOT_SPOT.x + HALF_L - R) / step) },
		(_, i) => FOOT_SPOT.x - (i + 1) * step,
	);
	const x = [...toFoot, ...toHead].find((candidate) => isFree(balls, candidate, 0, EIGHT_BALL));
	return placeBall(balls, EIGHT_BALL, { x: x ?? FOOT_SPOT.x, y: 0 });
}
