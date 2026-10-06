import type { PoolShotInput } from "@shared/pool";
import { describe, expect, it } from "vitest";
import { chooseShot } from "./ai";
import { midGame, table } from "./fixtures/tables";
import { shotProblem, takeShot } from "./game";
import { newGame, type PoolGame, shooterOf } from "./state";

const MAX_SHOTS = 400;

/** Play a whole game: the AI for everyone, except fixed inputs for `human` on their turns. */
function playOut(seed: number, human?: { name: string; input: PoolShotInput }) {
	let game: PoolGame = newGame({
		mode: "game",
		seed,
		sides: [["theo", "nora"], ["mika"]],
		breaker: seed % 2,
	});
	const shots: PoolShotInput[] = [];
	const problems: string[] = [];
	while (!game.result && game.shots < MAX_SHOTS) {
		const own =
			human && shooterOf(game) === human.name && !game.ballInHand && game.phase !== "break";
		const ai = chooseShot(game);
		const input = own
			? {
					...human.input,
					...(ai.input.calledPocket ? { calledPocket: ai.input.calledPocket } : {}),
				}
			: ai.input;
		const next = own ? game : { ...game, seed: ai.seed };
		const problem = shotProblem(next, input);
		if (problem) problems.push(problem);
		shots.push(input);
		game = takeShot(next, input).game;
	}
	return { game, shots, problems };
}

describe("the built-in AI", () => {
	it.each([1, 2, 3, 4])(
		"always proposes a shot the rules accept, and finishes a game (seed %i)",
		(seed) => {
			const { game, problems } = playOut(seed);
			expect(problems).toEqual([]);
			expect(game.result).not.toBeNull();
		},
	);

	it("replays the same game from the same seed and the same human inputs", () => {
		const human = { name: "mika", input: { angle: 37, power: 0.4 } };
		const first = playOut(9, human);
		const second = playOut(9, human);
		expect(second.shots).toEqual(first.shots);
		expect(second.game).toEqual(first.game);
		expect(playOut(10, human).shots).not.toEqual(first.shots);
	});

	it("places the cue ball legally with ball in hand, behind the head string after a break scratch", () => {
		const balls = table({ 0: [0, 0], 2: [0.5, 0.3], 9: [-0.2, -0.3], 8: [0.8, 0] });
		for (const ballInHand of ["kitchen", "anywhere"] as const) {
			const game = midGame(balls, { groups: ["solids", "stripes"], ballInHand });
			const { input } = chooseShot(game);
			expect(input.cue).toBeDefined();
			expect(shotProblem(game, input)).toBeNull();
		}
	});

	it("calls a pocket when it's on the 8, and sinks a hanging 8 there", () => {
		const balls = table({ 0: [0.6, 0.3], 8: [1.0, 0.45], 12: [-0.5, -0.2] });
		const game = midGame(balls, { groups: ["solids", "stripes"] });
		const { input } = chooseShot(game);
		expect(input.calledPocket).toBe("tr");
		expect(takeShot(game, input).game.result?.winner).toBe(0);
	});

	it("still hits a legal ball when every pot is blocked", () => {
		// The only solid hides behind a wall of stripes, out of every pocket line.
		const balls = table({
			0: [-0.8, 0],
			3: [0.3, 0],
			9: [0.1, 0],
			10: [0.1, 0.06],
			11: [0.1, -0.06],
			12: [0.36, 0.06],
			13: [0.36, -0.06],
			14: [0.42, 0],
			8: [0.9, 0.4],
		});
		const game = midGame(balls, { groups: ["solids", "stripes"] });
		const { input } = chooseShot(game);
		expect(shotProblem(game, input)).toBeNull();
		expect(input.cue).toBeUndefined();
	});
});
