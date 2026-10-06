/**
 * A pure seeded generator (mulberry32): the state is a 32-bit integer the game
 * carries, so the same seed replays the same rack, AI choices and aim errors.
 */
export interface Draw {
	/** Uniform in [0, 1). */
	readonly value: number;
	readonly seed: number;
}

export function nextRandom(seed: number): Draw {
	const state = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(state ^ (state >>> 15), state | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return { value: ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296, seed: state };
}

/** A seeded Fisher-Yates shuffle; returns the shuffled copy and the advanced seed. */
export function shuffle<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
	const out = [...items];
	let state = seed;
	for (let i = out.length - 1; i > 0; i -= 1) {
		const draw = nextRandom(state);
		state = draw.seed;
		const j = Math.floor(draw.value * (i + 1));
		const a = out[i] as T;
		out[i] = out[j] as T;
		out[j] = a;
	}
	return { items: out, seed: state };
}
