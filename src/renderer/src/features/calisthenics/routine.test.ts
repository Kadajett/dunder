import { GATHER_SECONDS, ROUTINE, WORKOUT_SECONDS } from "@shared/calisthenics";
import { describe, expect, it } from "vitest";
import { BLEND_SECONDS, Cue } from "./routine";

describe("workout timeline", () => {
	it("lasts between one and one and a half minutes", () => {
		expect(WORKOUT_SECONDS).toBeGreaterThanOrEqual(60);
		expect(WORKOUT_SECONDS).toBeLessThanOrEqual(90);
	});

	it("has no move while everyone gathers", () => {
		expect(new Cue().at(GATHER_SECONDS - 0.01).step).toBeUndefined();
	});

	it("opens with the first move straight from standing", () => {
		const cue = new Cue().at(GATHER_SECONDS);
		expect(cue.step).toBe(ROUTINE[0]);
		expect(cue.previous).toBeUndefined();
		expect(cue.blend).toBe(0);
	});

	it("flows from one move into the next", () => {
		const first = ROUTINE[0]?.seconds ?? 0;
		const cue = new Cue().at(GATHER_SECONDS + first + BLEND_SECONDS / 2);
		expect(cue.step).toBe(ROUTINE[1]);
		expect(cue.previous).toBe(ROUTINE[0]);
		expect(cue.local).toBeCloseTo(BLEND_SECONDS / 2);
		expect(cue.blend).toBeCloseTo(0.5);
		expect(cue.at(GATHER_SECONDS + first + BLEND_SECONDS).blend).toBe(1);
	});

	it("covers every move in order, then ends", () => {
		const cue = new Cue();
		const seen = new Set();
		for (let t = 0; t < WORKOUT_SECONDS; t += 0.5) {
			const { step } = cue.at(t);
			if (step) seen.add(step);
		}
		expect([...seen]).toEqual(ROUTINE);
		expect(cue.at(WORKOUT_SECONDS).step).toBeUndefined();
	});
});
