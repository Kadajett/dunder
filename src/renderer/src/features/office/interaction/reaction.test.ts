import { describe, expect, it } from "vitest";
import { pokeStrength, REACTION_SECONDS } from "./reaction";

const samples = Array.from({ length: 181 }, (_, i) => (i / 180) * REACTION_SECONDS);

describe("pokeStrength", () => {
	it("is at rest before the poke and once the reaction is over", () => {
		expect(pokeStrength(-0.1)).toBe(0);
		expect(pokeStrength(0)).toBe(0);
		expect(pokeStrength(REACTION_SECONDS)).toBe(0);
		expect(pokeStrength(REACTION_SECONDS + 5)).toBe(0);
	});

	it("swings both ways within [-1, 1]", () => {
		const values = samples.map(pokeStrength);
		expect(Math.max(...values)).toBeGreaterThan(0.3);
		expect(Math.min(...values)).toBeLessThan(-0.1);
		for (const value of values) expect(Math.abs(value)).toBeLessThanOrEqual(1);
	});

	it("settles: the last third moves far less than the first", () => {
		const peak = (from: number, to: number) =>
			Math.max(...samples.filter((t) => t >= from && t < to).map((t) => Math.abs(pokeStrength(t))));
		const third = REACTION_SECONDS / 3;
		expect(peak(2 * third, REACTION_SECONDS)).toBeLessThan(peak(0, third) / 4);
	});

	it("eases into rest instead of snapping at the end", () => {
		expect(Math.abs(pokeStrength(REACTION_SECONDS - 0.01))).toBeLessThan(0.01);
	});
});
