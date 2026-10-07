import { canPlaceCue, HEAD_SPOT, HEAD_STRING_X, POOL_TABLE, type PoolBall } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { angleTo, firstContact, MAX_PULL_METRES, pullPower, startingCue } from "./aim";

const R = POOL_TABLE.ballRadius;
const ball = (id: number, x: number, y: number, pocket: PoolBall["pocket"] = null): PoolBall => ({
	id,
	x,
	y,
	pocket,
});

describe("angleTo", () => {
	it("measures degrees counter-clockwise from table +x", () => {
		const from = { x: 0.2, y: -0.1 };
		expect(angleTo(from, { x: 0.7, y: -0.1 })).toBeCloseTo(0);
		expect(angleTo(from, { x: 0.2, y: 0.3 })).toBeCloseTo(90);
		expect(angleTo(from, { x: -0.3, y: -0.1 })).toBeCloseTo(180);
		expect(angleTo(from, { x: 0.2, y: -0.4 })).toBeCloseTo(-90);
		expect(angleTo(from, { x: 0.5, y: 0.2 })).toBeCloseTo(45);
	});
});

describe("pullPower", () => {
	const press = { x: 0, y: 0 };

	it("grows with the pull against the aim and caps at a full pull", () => {
		expect(pullPower(press, { x: -MAX_PULL_METRES / 2, y: 0 }, 0)).toBeCloseTo(0.5);
		expect(pullPower(press, { x: 0, y: -MAX_PULL_METRES / 4 }, 90)).toBeCloseTo(0.25);
		expect(pullPower(press, { x: -2, y: 0 }, 0)).toBe(1);
	});

	it("ignores sideways drift and gives nothing for pushing forward", () => {
		expect(pullPower(press, { x: -0.09, y: 0.3 }, 0)).toBeCloseTo(0.09 / MAX_PULL_METRES);
		expect(pullPower(press, { x: 0.2, y: 0 }, 0)).toBe(0);
		expect(pullPower(press, { x: 0, y: 0.3 }, 0)).toBe(0);
	});
});

describe("firstContact", () => {
	it("stops at the first ball along the line, at the ghost-ball spot 2R short of it", () => {
		const balls = [ball(0, -0.5, 0), ball(3, 0.4, 0), ball(5, 0.1, 0)];
		const contact = firstContact({ x: -0.5, y: 0 }, 0, balls);
		expect(contact.kind).toBe("ball");
		expect(contact.kind === "ball" && contact.id).toBe(5);
		expect(contact.at.x).toBeCloseTo(0.1 - 2 * R);
		expect(contact.at.y).toBeCloseTo(0);
	});

	it("touches a ball off the line within 2R (a thin cut)", () => {
		const balls = [ball(2, 0.3, 1.5 * R)];
		const contact = firstContact({ x: 0, y: 0 }, 0, balls);
		expect(contact.kind === "ball" && contact.id).toBe(2);
		const gap = Math.hypot(contact.at.x - 0.3, contact.at.y - 1.5 * R);
		expect(gap).toBeCloseTo(2 * R);
		expect(contact.at.y).toBeCloseTo(0);
	});

	it("passes balls just clear of the path, behind the cue ball, or potted, and reaches the cushion", () => {
		const balls = [ball(2, 0.3, 2.05 * R), ball(4, -0.3, 0), ball(6, 0.6, 0, "tr")];
		const contact = firstContact({ x: 0, y: 0 }, 0, balls);
		expect(contact.kind).toBe("cushion");
		expect(contact.at.x).toBeCloseTo(POOL_TABLE.length / 2 - R);
		expect(contact.at.y).toBeCloseTo(0);
	});

	it("reaches whichever cushion line comes first on a diagonal", () => {
		const contact = firstContact({ x: 0, y: 0 }, 45, []);
		expect(contact.kind).toBe("cushion");
		expect(contact.at.y).toBeCloseTo(POOL_TABLE.width / 2 - R);
		expect(contact.at.x).toBeCloseTo(POOL_TABLE.width / 2 - R);
		const down = firstContact({ x: 0.3, y: 0.1 }, -90, []);
		expect(down.at.x).toBeCloseTo(0.3);
		expect(down.at.y).toBeCloseTo(-(POOL_TABLE.width / 2 - R));
	});

	it("hits a ball sitting in a pocket mouth, but not one past the cushion line", () => {
		const mouth = [ball(7, POOL_TABLE.length / 2 - R / 2, 0)];
		expect(firstContact({ x: 0, y: 0 }, 0, mouth).kind).toBe("ball");
		const beyond = [ball(7, 0.2, POOL_TABLE.width / 2 + 3 * R)];
		expect(firstContact({ x: 0.2, y: 0 }, 90, beyond).kind).toBe("cushion");
	});
});

describe("canPlaceCue", () => {
	const balls = [ball(0, 0.4, 0, "br"), ball(1, -0.8, 0.1), ball(9, 0.5, 0)];

	it("keeps a kitchen placement behind the head string", () => {
		expect(canPlaceCue(balls, { x: HEAD_STRING_X, y: 0 }, "kitchen")).toBe(true);
		expect(canPlaceCue(balls, { x: HEAD_STRING_X + 0.01, y: 0 }, "kitchen")).toBe(false);
		expect(canPlaceCue(balls, { x: HEAD_STRING_X + 0.01, y: 0 }, "anywhere")).toBe(true);
	});

	it("keeps the cue ball on the cloth", () => {
		const edgeX = POOL_TABLE.length / 2 - R;
		expect(canPlaceCue(balls, { x: edgeX, y: 0.3 }, "anywhere")).toBe(true);
		expect(canPlaceCue(balls, { x: edgeX + 0.001, y: 0.3 }, "anywhere")).toBe(false);
		expect(canPlaceCue(balls, { x: 0, y: -(POOL_TABLE.width / 2 - R) - 0.001 }, "anywhere")).toBe(
			false,
		);
		expect(canPlaceCue(balls, { x: Number.NaN, y: 0 }, "anywhere")).toBe(false);
	});

	it("needs 2R of clearance from object balls, not from the cue ball's old spot", () => {
		expect(canPlaceCue(balls, { x: -0.8 + 1.9 * R, y: 0.1 }, "kitchen")).toBe(false);
		expect(canPlaceCue(balls, { x: -0.8 + 2.1 * R, y: 0.1 }, "kitchen")).toBe(true);
		expect(canPlaceCue(balls, { x: 0.4, y: 0 }, "anywhere")).toBe(true);
		expect(canPlaceCue(balls, { x: 0.5, y: R }, "anywhere")).toBe(false);
	});
});

describe("startingCue", () => {
	it("keeps the cue ball where it lies when that is legal", () => {
		const balls = [ball(0, 0.3, 0.2), ball(1, 0.6, 0)];
		expect(startingCue(balls, "anywhere")).toEqual({ x: 0.3, y: 0.2 });
	});

	it("moves a cue ball out of the kitchen rule back behind the head string", () => {
		const balls = [ball(0, 0.3, 0.2), ball(1, 0.6, 0)];
		expect(startingCue(balls, "kitchen")).toEqual(HEAD_SPOT);
	});

	it("finds a free head-end spot when the head spot is taken", () => {
		const balls = [ball(0, 0, 0, "bm"), ball(4, HEAD_SPOT.x, HEAD_SPOT.y)];
		const spot = startingCue(balls, "kitchen");
		expect(canPlaceCue(balls, spot, "kitchen")).toBe(true);
	});
});
