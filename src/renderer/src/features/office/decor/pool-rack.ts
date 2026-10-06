import { CUE_BALL, FOOT_SPOT, HEAD_SPOT, POOL_TABLE, type PoolBall } from "@shared/pool";

/** Racked balls sit this far apart, as in the engine, so none starts overlapping a neighbour. */
const RACK_GAP = 0.0002;

/**
 * Rack order, apex first and rows of 1-5 toward the foot rail: the 8 in the
 * centre, a solid and a stripe in the back corners, solids and stripes mixed.
 */
const ORDER = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 6, 13, 7, 14, 15] as const;

/**
 * The table at rest, before the engine sends a game: a fresh rack with its apex
 * on the foot spot and the cue ball on the head spot.
 */
export function restingRack(): PoolBall[] {
	const pitch = 2 * POOL_TABLE.ballRadius + RACK_GAP;
	const rowStep = pitch * Math.cos(Math.PI / 6);
	const slots = [0, 1, 2, 3, 4].flatMap((row) =>
		Array.from({ length: row + 1 }, (_, i) => ({
			x: FOOT_SPOT.x + row * rowStep,
			y: (i - row / 2) * pitch,
		})),
	);
	const objects = ORDER.map((id, slot) => ({ id, ...(slots[slot] ?? FOOT_SPOT), pocket: null }));
	return [{ id: CUE_BALL, ...HEAD_SPOT, pocket: null }, ...objects];
}
