import { CUE_BALL, canPlaceCue, type PoolShotInput } from "@shared/pool";
import { MAX_SPEED, type Simulation, simulate } from "./physics";
import { judge } from "./rules";
import { isOnEight, type PoolGame } from "./state";
import { placeBall } from "./table";

/** Why the shot can't be taken, or null when it can. */
export function shotProblem(game: PoolGame, input: PoolShotInput): string | null {
	if (game.result) return "the game is over";
	if (!Number.isFinite(input.angle)) return "the angle must be a number";
	if (!(input.power > 0 && input.power <= 1)) return "power must be above 0 and at most 1";
	if (game.ballInHand && !input.cue) return "place the cue ball first";
	if (!game.ballInHand && input.cue) return "the cue ball can only be moved with ball in hand";
	if (game.ballInHand && input.cue && !canPlaceCue(game.balls, input.cue, game.ballInHand)) {
		return game.ballInHand === "kitchen"
			? "the cue ball must go behind the head string, clear of other balls"
			: "the cue ball must go on the cloth, clear of other balls";
	}
	if (isOnEight(game) && !input.calledPocket) return "call a pocket for the 8";
	return null;
}

export interface ShotTaken {
	readonly game: PoolGame;
	readonly simulation: Simulation;
}

/** Strike the cue ball and apply the rules; throws on a shot `shotProblem` refuses. */
export function takeShot(
	game: PoolGame,
	input: PoolShotInput,
	record?: { readonly frames: boolean },
): ShotTaken {
	const problem = shotProblem(game, input);
	if (problem) throw new Error(problem);
	const balls = input.cue ? placeBall(game.balls, CUE_BALL, input.cue) : game.balls;
	const placed = { ...game, balls };
	const simulation = simulate(
		balls,
		{ angle: input.angle, speed: input.power * MAX_SPEED },
		record?.frames ? { shot: game.shots + 1 } : undefined,
	);
	return { game: judge(placed, input, simulation), simulation };
}

/** Seat a player on a side; it shoots when that side's rotation reaches it. */
export function addPlayer(game: PoolGame, side: number, name: string): PoolGame {
	return {
		...game,
		sides: game.sides.map((s, i) => (i === side ? { ...s, players: [...s.players, name] } : s)),
	};
}

/** Take a player off its side; a side left empty forfeits a game. */
export function removePlayer(game: PoolGame, name: string): PoolGame {
	const sideIndex = game.sides.findIndex((side) => side.players.includes(name));
	const side = game.sides[sideIndex];
	if (!side) return game;
	const at = side.players.indexOf(name);
	const players = side.players.filter((player) => player !== name);
	const current = side.cursor % side.players.length;
	// Keep the same next shooter; when it was this player, the one after it takes over.
	const cursor = players.length === 0 ? 0 : (at < current ? current - 1 : current) % players.length;
	const sides = game.sides.map((s, i) => (i === sideIndex ? { ...s, players, cursor } : s));
	const forfeit = players.length === 0 && game.mode === "game" && !game.result;
	return {
		...game,
		sides,
		result: forfeit
			? { winner: 1 - sideIndex, reason: "forfeit: nobody left on the other side" }
			: game.result,
	};
}
