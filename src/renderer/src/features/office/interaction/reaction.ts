/** How long a poked plant or cooler keeps moving, in seconds. */
export const REACTION_SECONDS = 0.9;

/** Oscillations per second of the wiggle. */
const FREQUENCY = 3.2;
/** Exponential decay rate: the swing is down to ~2% by the end. */
const DECAY = 4.4;

/**
 * Strength of a poke reaction `elapsed` seconds after the click: a damped
 * oscillation in [-1, 1] that starts and ends at rest (0 outside the reaction).
 */
export function pokeStrength(elapsed: number): number {
	if (elapsed <= 0 || elapsed >= REACTION_SECONDS) return 0;
	const fade = 1 - elapsed / REACTION_SECONDS;
	return Math.exp(-DECAY * elapsed) * fade * Math.sin(2 * Math.PI * FREQUENCY * elapsed);
}
