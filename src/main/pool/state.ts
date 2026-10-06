import {
	CUE_BALL,
	EIGHT_BALL,
	groupOf,
	type PoolBall,
	type PoolBallInHand,
	type PoolGroup,
	type PoolShotReport,
} from "@shared/pool";
import { onTable, rack } from "./table";

export interface GameSide {
	readonly players: readonly string[];
	readonly group: PoolGroup | null;
	/** Rotates per visit: the side's next shooter is `players[cursor % players.length]`. */
	readonly cursor: number;
}

export interface GameResult {
	/** The winning side, or null for a draw. */
	readonly winner: number | null;
	readonly reason: string;
}

/**
 * One rack of 8-ball (two sides) or practice (one side), as pure data: the
 * seed carries every random choice, so a seed plus the shots replays the game.
 */
export interface PoolGame {
	readonly mode: "game" | "practice";
	readonly seed: number;
	readonly balls: readonly PoolBall[];
	readonly sides: readonly GameSide[];
	readonly turn: number;
	readonly phase: "break" | "open" | "groups";
	readonly ballInHand: PoolBallInHand | null;
	/** Shots in a row that potted nothing (the stalemate guard). */
	readonly dryShots: number;
	readonly shots: number;
	readonly result: GameResult | null;
	readonly last: PoolShotReport | null;
}

export function newGame(options: {
	readonly mode: "game" | "practice";
	readonly seed: number;
	readonly sides: readonly (readonly string[])[];
	readonly breaker: number;
}): PoolGame {
	const racked = rack(options.seed);
	return {
		mode: options.mode,
		seed: racked.seed,
		balls: racked.balls,
		sides: options.sides.map((players) => ({ players, group: null, cursor: 0 })),
		turn: options.breaker,
		phase: "break",
		ballInHand: "kitchen",
		dryShots: 0,
		shots: 0,
		result: null,
		last: null,
	};
}

export function shooterOf(game: PoolGame): string | null {
	if (game.result) return null;
	const side = game.sides[game.turn];
	return side?.players[side.cursor % side.players.length] ?? null;
}

/** The balls the shooter may hit first. */
export function targetsOf(game: PoolGame): number[] {
	const objects = onTable(game.balls)
		.map((ball) => ball.id)
		.filter((id) => id !== CUE_BALL);
	if (game.mode === "practice" || game.phase === "break") return objects;
	const group = game.sides[game.turn]?.group;
	const legal = objects.filter((id) => (group ? groupOf(id) === group : id !== EIGHT_BALL));
	return legal.length > 0 ? legal : objects.filter((id) => id === EIGHT_BALL);
}

/** The shooter's side has cleared its group, so the shot is on the 8 and needs a called pocket. */
export function isOnEight(game: PoolGame): boolean {
	if (game.mode === "practice" || game.phase !== "groups") return false;
	const targets = targetsOf(game);
	return targets.length === 1 && targets[0] === EIGHT_BALL;
}
