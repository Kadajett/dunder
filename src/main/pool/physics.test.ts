import { CUE_BALL, POCKETS, POOL_TABLE } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { angleTo } from "./ai-lines";
import { table } from "./fixtures/tables";
import { MAX_SPEED, simulate } from "./physics";
import { ballById, rack } from "./table";

const R = POOL_TABLE.ballRadius;
const HALF_L = POOL_TABLE.length / 2;

describe("simulate", () => {
	it("replays a break exactly: same table, same strike, same result", () => {
		const { balls } = rack(5);
		const strike = { angle: 0.3, speed: MAX_SPEED };
		const a = simulate(balls, strike, { shot: 1 });
		const b = simulate(balls, strike, { shot: 1 });
		expect(a).toEqual(b);
		expect(a.events.firstContact).not.toBeNull();
		expect(
			a.balls.every(
				(ball) =>
					ball.pocket !== null ||
					(Math.abs(ball.x) <= HALF_L && Math.abs(ball.y) <= POOL_TABLE.width / 2),
			),
		).toBe(true);
	});

	it("pots a straight-in ball in the aimed corner and reports the contact", () => {
		const pocket = POCKETS.tr;
		const target = { x: 0.7, y: 0.25 };
		const toPocket = Math.atan2(pocket.y - target.y, pocket.x - target.x);
		const cue = { x: target.x - Math.cos(toPocket) * 0.5, y: target.y - Math.sin(toPocket) * 0.5 };
		const balls = table({ 0: [cue.x, cue.y], 5: [target.x, target.y] });
		const result = simulate(balls, { angle: angleTo(cue, target), speed: 2 });
		expect(result.events.firstContact).toBe(5);
		expect(result.events.pocketed[0]).toEqual({ id: 5, pocket: "tr" });
	});

	it("bounces off a cushion, losing speed, and counts the rail only after contact", () => {
		const balls = table({ 0: [0, 0], 3: [0.6, 0] });
		const result = simulate(balls, { angle: 0, speed: 1.5 });
		expect(result.events.firstContact).toBe(3);
		expect(result.events.railAfterContact).toBe(true);
		expect(result.events.objectBallsToRail).toBe(1);
		const three = ballById(result.balls, 3);
		expect(three?.pocket).toBeNull();
		expect(three?.x).toBeLessThan(HALF_L - R);
	});

	it("drops a ball sent along the rail into the side pocket's opening only through the jaws", () => {
		const intoSide = simulate(table({ 0: [0, 0] }), { angle: 90, speed: 1 });
		expect(intoSide.events.pocketed).toEqual([{ id: CUE_BALL, pocket: "tm" }]);
		const offRail = simulate(table({ 0: [0.3, 0] }), { angle: 90, speed: 1 });
		expect(offRail.events.pocketed).toEqual([]);
	});

	it("records ~30 Hz frames of the balls still on the table, ending at rest", () => {
		const result = simulate(
			table({ 0: [-0.5, 0], 2: [0.3, 0.2] }),
			{ angle: 0, speed: 1 },
			{ shot: 4 },
		);
		expect(result.frames.length).toBeGreaterThan(30);
		expect(result.frames[1]?.t).toBeCloseTo(1 / 30, 4);
		expect(result.frames.every((frame) => frame.shot === 4 && frame.balls.length === 2)).toBe(true);
		const last = result.frames.at(-1);
		expect(last?.balls[0]?.[1]).toBeCloseTo(ballById(result.balls, CUE_BALL)?.x ?? Number.NaN, 3);
	});
});
