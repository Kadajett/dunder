import { POOL_TABLE, type PoolFrame } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { cueTip, STROKE_SECONDS, strikeOf } from "./stroke";

const frame = (shot: number, t: number, cue: readonly [number, number] | null): PoolFrame => ({
	shot,
	t,
	balls: [...(cue ? [[0, cue[0], cue[1]] as const] : []), [5, 0.5, 0.2] as const],
});

describe("the cue stroke", () => {
	it("reads the strike off the first frames: where the cue ball sat and the way it left", () => {
		const first = frame(4, 0, [-0.5, 0]);
		expect(strikeOf(first, first)).toBeNull();
		const strike = strikeOf(first, frame(4, 1 / 30, [-0.45, 0.05]));
		expect(strike).toMatchObject({ shot: 4, x: -0.5, y: 0 });
		expect(strike?.angle).toBeCloseTo(Math.PI / 4);
		expect(strikeOf(first, frame(5, 1 / 30, [-0.45, 0.05]))).toBeNull();
		expect(strikeOf(first, frame(4, 1 / 30, null))).toBeNull();
	});

	it("puts the tip against the ball at the strike, follows through, and is gone after the stroke", () => {
		const strike = { shot: 1, x: 0, y: 0, angle: 0 };
		expect(cueTip(strike, 0)?.x).toBeCloseTo(-POOL_TABLE.ballRadius);
		const later = cueTip(strike, 0.3);
		expect(later?.x).toBeGreaterThan(0.05);
		expect(later?.y).toBeCloseTo(0);
		expect(cueTip(strike, STROKE_SECONDS + 0.01)).toBeNull();
	});
});
