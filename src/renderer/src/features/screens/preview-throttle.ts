/** DOM previews copy the shared painter at most this often (~4 fps), like the 3D monitors. */
export const PREVIEW_INTERVAL_MS = 250;

/**
 * How long to wait before the next preview copy: 0 draws now, otherwise the
 * rest of the interval since the last copy. `lastDrawAt` is undefined before
 * the first copy.
 */
export function previewDelay(
	lastDrawAt: number | undefined,
	now: number,
	intervalMs = PREVIEW_INTERVAL_MS,
): number {
	if (lastDrawAt === undefined) return 0;
	return Math.min(intervalMs, Math.max(0, lastDrawAt + intervalMs - now));
}
