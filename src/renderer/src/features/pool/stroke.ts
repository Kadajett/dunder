import { CUE_BALL, POOL_TABLE, type PoolFrame } from "@shared/pool";

/** The cue shows this long after each strike (seconds of the shot's clock). */
export const STROKE_SECONDS = 0.6;
/** How far the tip follows through after the strike, in metres, reached after FOLLOW_SECONDS. */
const FOLLOW = 0.12;
const FOLLOW_SECONDS = 0.12;

/** Where the cue ball was struck (table space) and the way it went (radians, table frame). */
export interface Strike {
	readonly shot: number;
	readonly x: number;
	readonly y: number;
	readonly angle: number;
}

function cueIn(frame: PoolFrame): { x: number; y: number } | undefined {
	const ball = frame.balls.find(([id]) => id === CUE_BALL);
	return ball ? { x: ball[1], y: ball[2] } : undefined;
}

/**
 * The strike, read off the shot's first frame and the first one where the cue
 * ball has moved (call it with frames as they arrive and keep the first
 * answer: later frames may already show the cue ball deflected). Null until
 * the cue ball moves, or for frames of another shot.
 */
export function strikeOf(first: PoolFrame, frame: PoolFrame): Strike | null {
	if (first.shot !== frame.shot) return null;
	const start = cueIn(first);
	const now = cueIn(frame);
	if (!start || !now) return null;
	const dx = now.x - start.x;
	const dy = now.y - start.y;
	if (Math.hypot(dx, dy) < 1e-4) return null;
	return { shot: frame.shot, x: start.x, y: start.y, angle: Math.atan2(dy, dx) };
}

/** The cue's tip `t` seconds after the strike, following through; null once the stroke is over. */
export function cueTip(strike: Strike, t: number): { x: number; y: number } | null {
	if (t > STROKE_SECONDS) return null;
	const reach = Math.min(1, t / FOLLOW_SECONDS) * FOLLOW - POOL_TABLE.ballRadius;
	return {
		x: strike.x + Math.cos(strike.angle) * reach,
		y: strike.y + Math.sin(strike.angle) * reach,
	};
}
