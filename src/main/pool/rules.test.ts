import { CUE_BALL, EIGHT_BALL, FOOT_SPOT, groupOf, HEAD_STRING_X, POOL_TABLE } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { midGame, shot, table } from "./fixtures/tables";
import { shotProblem } from "./game";
import { judge, STALEMATE_SHOTS } from "./rules";
import { newGame, type PoolGame, shooterOf } from "./state";
import { ballById } from "./table";

const R = POOL_TABLE.ballRadius;
const fresh = (): PoolGame =>
	newGame({ mode: "game", seed: 11, sides: [["theo"], ["mika"]], breaker: 0 });
const aim = { angle: 0, power: 0.5 };

describe("rule 1: the rack", () => {
	it.each([1, 2, 3, 99])(
		"puts the apex on the foot spot, the 8 in the middle, a solid and a stripe in the back corners (seed %i)",
		(seed) => {
			const game = newGame({ mode: "game", seed, sides: [["a"], ["b"]], breaker: 0 });
			const objects = game.balls.filter((ball) => ball.id !== CUE_BALL);
			const apex = objects.reduce((min, ball) => (ball.x < min.x ? ball : min));
			expect(apex).toMatchObject({ x: FOOT_SPOT.x, y: 0 });
			// Rows are √3·R apart: the fifth row sits ~6.9 R behind the apex, the fourth ~5.2 R.
			const backRow = objects
				.filter((ball) => ball.x > FOOT_SPOT.x + 6 * R)
				.sort((a, b) => a.y - b.y);
			expect(backRow).toHaveLength(5);
			expect([groupOf(backRow[0]?.id ?? 0), groupOf(backRow[4]?.id ?? 0)].sort()).toEqual([
				"solids",
				"stripes",
			]);
			const eight = ballById(game.balls, EIGHT_BALL);
			expect(eight?.x).toBeCloseTo(FOOT_SPOT.x + 2 * (2 * R + 0.0002) * Math.cos(Math.PI / 6));
			expect(eight?.y).toBeCloseTo(0);
			expect(game.ballInHand).toBe("kitchen");
			expect(game.phase).toBe("break");
		},
	);

	it("varies the other balls by seed", () => {
		const order = (seed: number): number[] =>
			newGame({ mode: "game", seed, sides: [["a"], ["b"]], breaker: 0 })
				.balls.slice()
				.sort((a, b) => a.x - b.x || a.y - b.y)
				.map((ball) => ball.id);
		expect(order(1)).not.toEqual(order(2));
		expect(order(1)).toEqual(order(1));
	});
});

describe("rules 2-4: the break", () => {
	it("re-racks for the opponent when nothing drops and fewer than 4 balls reach a rail (no foul)", () => {
		const game = fresh();
		const after = judge(game, aim, shot(game.balls, { firstContact: 1, objectBallsToRail: 3 }));
		expect(after.turn).toBe(1);
		expect(after.phase).toBe("break");
		expect(after.ballInHand).toBe("kitchen");
		expect(after.balls.every((ball) => ball.pocket === null)).toBe(true);
		expect(after.last?.text).toContain("illegal break");
	});

	it("passes the turn on a legal break that pots nothing (4 balls to a rail), table open", () => {
		const game = fresh();
		const after = judge(game, aim, shot(game.balls, { firstContact: 1, objectBallsToRail: 4 }));
		expect(after).toMatchObject({ turn: 1, phase: "open", ballInHand: null });
	});

	it("lets the breaker continue after potting, with the table still open", () => {
		const game = fresh();
		const after = judge(
			game,
			aim,
			shot(game.balls, { firstContact: 1, pocketed: [{ id: 3, pocket: "tr" }] }),
		);
		expect(after).toMatchObject({ turn: 0, phase: "open", ballInHand: null });
		expect(after.sides.map((side) => side.group)).toEqual([null, null]);
	});

	it("gives ball in hand behind the head string for a scratch on the break; potted balls stay down", () => {
		const game = fresh();
		const pocketed = [
			{ id: 5, pocket: "br" as const },
			{ id: CUE_BALL, pocket: "tm" as const },
		];
		const after = judge(game, aim, shot(game.balls, { firstContact: 1, pocketed }));
		expect(after).toMatchObject({ turn: 1, ballInHand: "kitchen", phase: "open" });
		expect(ballById(after.balls, 5)?.pocket).toBe("br");
		expect(shotProblem(after, { ...aim, cue: { x: HEAD_STRING_X + 0.1, y: 0 } })).toContain(
			"behind the head string",
		);
		expect(shotProblem(after, { ...aim, cue: { x: HEAD_STRING_X - 0.1, y: 0.2 } })).toBeNull();
	});

	it("re-spots the 8 potted on the break; the breaker continues without a scratch", () => {
		const game = fresh();
		const after = judge(
			game,
			aim,
			shot(game.balls, { firstContact: 1, pocketed: [{ id: EIGHT_BALL, pocket: "tr" }] }),
		);
		expect(after.result).toBeNull();
		expect(after.turn).toBe(0);
		const eight = ballById(after.balls, EIGHT_BALL);
		expect(eight?.pocket).toBeNull();
		// The apex ball still sits on the foot spot, so the 8 goes behind it toward the foot rail.
		expect(eight?.x).toBeGreaterThan(FOOT_SPOT.x);
		expect(eight?.y).toBe(0);
	});

	it("re-spots the 8 and gives the opponent the kitchen when the break also scratches", () => {
		const game = fresh();
		const pocketed = [
			{ id: EIGHT_BALL, pocket: "tr" as const },
			{ id: CUE_BALL, pocket: "bl" as const },
		];
		const after = judge(game, aim, shot(game.balls, { firstContact: 1, pocketed }));
		expect(after).toMatchObject({ result: null, turn: 1, ballInHand: "kitchen" });
		expect(ballById(after.balls, EIGHT_BALL)?.pocket).toBeNull();
	});
});

describe("rules 5-6: open table and groups", () => {
	const balls = table({ 0: [-0.5, 0], 2: [0.2, 0.1], 8: [0.4, 0], 12: [0.3, -0.2] });

	it("allows any ball but the 8 first while open", () => {
		const game = midGame(balls);
		const stripeFirst = judge(game, aim, shot(balls, { firstContact: 12, railAfterContact: true }));
		expect(stripeFirst).toMatchObject({ ballInHand: null, turn: 1 });
		const eightFirst = judge(
			game,
			aim,
			shot(balls, { firstContact: EIGHT_BALL, railAfterContact: true }),
		);
		expect(eightFirst).toMatchObject({ ballInHand: "anywhere", turn: 1 });
	});

	it("assigns the groups by the first ball legally potted, even when both groups drop", () => {
		const game = midGame(balls);
		const pocketed = [
			{ id: 12, pocket: "br" as const },
			{ id: 2, pocket: "tr" as const },
		];
		const after = judge(game, aim, shot(balls, { firstContact: 2, pocketed }));
		expect(after.sides.map((side) => side.group)).toEqual(["stripes", "solids"]);
		expect(after).toMatchObject({ phase: "groups", turn: 0 });
	});

	it("assigns nothing when the pot came on a foul", () => {
		const game = midGame(balls);
		const pocketed = [
			{ id: 2, pocket: "tr" as const },
			{ id: CUE_BALL, pocket: "bl" as const },
		];
		const after = judge(game, aim, shot(balls, { firstContact: 2, pocketed }));
		expect(after.sides.map((side) => side.group)).toEqual([null, null]);
		expect(after.phase).toBe("open");
	});
});

describe("rules 7, 9, 10: legal shots, visits and fouls", () => {
	const balls = table({ 0: [-0.5, 0], 2: [0.2, 0.1], 3: [0.1, 0.3], 8: [0.4, 0], 12: [0.3, -0.2] });
	const game = midGame(balls, { groups: ["solids", "stripes"] });

	it("keeps the visit going while the shooter pots its own group", () => {
		const after = judge(
			game,
			aim,
			shot(balls, { firstContact: 2, pocketed: [{ id: 2, pocket: "tr" }] }),
		);
		expect(after).toMatchObject({ turn: 0, ballInHand: null });
		expect(after.last?.text).toBe("theo: potted 2 · solids continue");
	});

	it("passes the turn when only an opponent's ball drops; it stays down for them", () => {
		const after = judge(
			game,
			aim,
			shot(balls, { firstContact: 2, pocketed: [{ id: 12, pocket: "br" }] }),
		);
		expect(after).toMatchObject({ turn: 1, ballInHand: null });
		expect(ballById(after.balls, 12)?.pocket).toBe("br");
	});

	it("passes the turn without a foul on a legal miss (own ball first, then a rail)", () => {
		const after = judge(game, aim, shot(balls, { firstContact: 3, railAfterContact: true }));
		expect(after).toMatchObject({ turn: 1, ballInHand: null });
	});

	it.each([
		[
			"a scratch",
			{
				firstContact: 2,
				railAfterContact: true,
				pocketed: [{ id: CUE_BALL, pocket: "tm" as const }],
			},
			"scratch",
		],
		[
			"hitting the wrong group first",
			{ firstContact: 12, railAfterContact: true },
			"hit the 12 first",
		],
		[
			"hitting the 8 first before the group is cleared",
			{ firstContact: EIGHT_BALL, railAfterContact: true },
			"hit the 8 first",
		],
		["hitting nothing", {}, "no ball hit"],
		["no rail after contact and nothing potted", { firstContact: 2 }, "no rail after contact"],
	])("fouls for %s: ball in hand anywhere for the opponent", (_case, events, reason) => {
		const after = judge(game, aim, shot(balls, events));
		expect(after).toMatchObject({ turn: 1, ballInHand: "anywhere", result: null });
		expect(after.last?.text).toContain(`foul: ${reason}`);
		expect(shotProblem(after, { ...aim, cue: { x: 0.9, y: -0.4 } })).toBeNull();
	});

	it("rotates players within a side per visit", () => {
		const teams = {
			...game,
			sides: [
				{ players: ["theo", "nora"], group: "solids" as const, cursor: 0 },
				{ players: ["mika"], group: "stripes" as const, cursor: 0 },
			],
		};
		const miss = shot(balls, { firstContact: 3, railAfterContact: true });
		const afterTheo = judge(teams, aim, miss);
		expect(shooterOf(afterTheo)).toBe("mika");
		const afterMika = judge(
			afterTheo,
			aim,
			shot(balls, { firstContact: 12, railAfterContact: true }),
		);
		expect(shooterOf(afterMika)).toBe("nora");
	});
});

describe("rules 8, 11, 12: the 8", () => {
	const balls = table({ 0: [-0.5, 0], 8: [0.4, 0], 12: [0.3, -0.2] });
	const onEight = midGame(balls, { groups: ["solids", "stripes"] });
	const eightIn = {
		firstContact: EIGHT_BALL,
		pocketed: [{ id: EIGHT_BALL, pocket: "tr" as const }],
	};

	it("needs a called pocket for the 8 but none for group balls", () => {
		expect(shotProblem(onEight, aim)).toBe("call a pocket for the 8");
		expect(shotProblem(onEight, { ...aim, calledPocket: "tr" })).toBeNull();
		const notYet = midGame(table({ 0: [-0.5, 0], 2: [0, 0], 8: [0.4, 0] }), {
			groups: ["solids", "stripes"],
		});
		expect(shotProblem(notYet, aim)).toBeNull();
	});

	it("wins with the 8 legally in the called pocket", () => {
		const after = judge(onEight, { ...aim, calledPocket: "tr" }, shot(balls, eightIn));
		expect(after.result).toEqual({ winner: 0, reason: "8 in the called pocket (tr)" });
	});

	it("loses with the 8 in another pocket", () => {
		const after = judge(onEight, { ...aim, calledPocket: "br" }, shot(balls, eightIn));
		expect(after.result?.winner).toBe(1);
	});

	it("loses on a scratch with the 8", () => {
		const scratch = {
			...eightIn,
			pocketed: [...eightIn.pocketed, { id: CUE_BALL, pocket: "bl" as const }],
		};
		const after = judge(onEight, { ...aim, calledPocket: "tr" }, shot(balls, scratch));
		expect(after.result).toMatchObject({ winner: 1, reason: "8 down on a foul (scratch)" });
	});

	it("loses when the 8 drops before the group is cleared, even with the last group ball on the same shot", () => {
		const lastSolid = table({ 0: [-0.5, 0], 2: [0.2, 0.1], 8: [0.4, 0], 12: [0.3, -0.2] });
		const game = midGame(lastSolid, { groups: ["solids", "stripes"] });
		const both = {
			firstContact: 2,
			pocketed: [
				{ id: 2, pocket: "tr" as const },
				{ id: EIGHT_BALL, pocket: "br" as const },
			],
		};
		expect(judge(game, aim, shot(lastSolid, both)).result).toMatchObject({
			winner: 1,
			reason: "8 down before the group was cleared",
		});
	});

	it("loses with the 8 down on an open table", () => {
		const game = midGame(table({ 0: [-0.5, 0], 2: [0.2, 0.1], 8: [0.4, 0] }));
		const after = judge(
			game,
			aim,
			shot(game.balls, { firstContact: 2, pocketed: [{ id: EIGHT_BALL, pocket: "tr" }] }),
		);
		expect(after.result?.winner).toBe(1);
	});
});

describe("rule 13: stalemate", () => {
	it(`draws after ${STALEMATE_SHOTS} shots in a row without a pot`, () => {
		const balls = table({ 0: [-0.5, 0], 2: [0.2, 0.1], 12: [0.3, -0.2], 8: [0.4, 0] });
		const game = midGame(balls, { groups: ["solids", "stripes"], dryShots: STALEMATE_SHOTS - 1 });
		const after = judge(game, aim, shot(balls, { firstContact: 2, railAfterContact: true }));
		expect(after.result).toEqual({
			winner: null,
			reason: `${STALEMATE_SHOTS} shots without a pot`,
		});
		const potted = judge(
			game,
			aim,
			shot(balls, { firstContact: 2, pocketed: [{ id: 2, pocket: "tr" }] }),
		);
		expect(potted).toMatchObject({ result: null, dryShots: 0 });
	});
});

describe("practice", () => {
	it("has no fouls: a scratch gives ball in hand anywhere, an empty table re-racks", () => {
		const game = {
			...newGame({ mode: "practice", seed: 3, sides: [["nora"]], breaker: 0 }),
			phase: "open" as const,
			ballInHand: null,
		};
		const balls = table({ 0: [-0.5, 0], 4: [0.2, 0.1] });
		const scratch = judge(
			{ ...game, balls },
			aim,
			shot(balls, { pocketed: [{ id: CUE_BALL, pocket: "tl" }] }),
		);
		expect(scratch).toMatchObject({ ballInHand: "anywhere", result: null, turn: 0 });
		const cleared = judge(
			{ ...game, balls },
			aim,
			shot(balls, { firstContact: 4, pocketed: [{ id: 4, pocket: "tr" }] }),
		);
		expect(cleared).toMatchObject({ phase: "break", ballInHand: "kitchen" });
		expect(cleared.balls.every((ball) => ball.pocket === null)).toBe(true);
	});
});
