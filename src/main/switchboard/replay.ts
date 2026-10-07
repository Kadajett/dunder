/**
 * How far back a tail reads when it lost its place in a file (state missing or
 * corrupt, the file moved): it cannot tell handled lines from new ones, so it
 * takes only recent ones rather than re-sending every message ever written.
 */
export const REPLAY_MAX_AGE_MS = 60 * 60_000;

/**
 * The lines whose ISO timestamp `field` is at or after `notBefore`, and how many
 * were older. Lines without a readable timestamp pass: their own parser
 * decides about them.
 */
export function linesSince(
	lines: readonly string[],
	field: "sentAt" | "requestedAt",
	notBefore: number,
): { readonly fresh: string[]; readonly skipped: number } {
	const fresh = lines.filter((line) => {
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			return true;
		}
		if (typeof json !== "object" || json === null) return true;
		const value: unknown = Reflect.get(json, field);
		if (value === undefined) return true;
		const at = Date.parse(String(value));
		return Number.isNaN(at) || at >= notBefore;
	});
	return { fresh, skipped: lines.length - fresh.length };
}
