import { BALL_IDS, EIGHT_BALL, groupOf, POOL_TABLE } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { restingRack } from "./pool-rack";

describe("restingRack", () => {
	const balls = restingRack();
	const R = POOL_TABLE.ballRadius;

	it("racks every ball once, on the cloth, none overlapping", () => {
		expect(balls.map((ball) => ball.id).sort((a, b) => a - b)).toEqual(BALL_IDS);
		for (const ball of balls) {
			expect(Math.abs(ball.x)).toBeLessThanOrEqual(POOL_TABLE.length / 2 - R);
			expect(Math.abs(ball.y)).toBeLessThanOrEqual(POOL_TABLE.width / 2 - R);
		}
		for (const [i, a] of balls.entries()) {
			for (const b of balls.slice(i + 1))
				expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * R);
		}
	});

	it("puts the 8 in the centre of the triangle and a solid and a stripe in the back corners", () => {
		const objects = balls.filter((ball) => ball.id !== 0);
		const backX = Math.max(...objects.map((ball) => ball.x));
		const back = objects.filter((ball) => Math.abs(ball.x - backX) < 1e-9);
		const corners = [back[0], back.at(-1)].map((ball) => groupOf(ball?.id ?? 0));
		expect(corners.sort()).toEqual(["solids", "stripes"]);
		const third = objects.filter((ball) => ball.y === 0).sort((a, b) => a.x - b.x)[1];
		expect(third?.id).toBe(EIGHT_BALL);
	});
});
