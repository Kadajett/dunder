import {
	CUE_BALL,
	EIGHT_BALL,
	FOOT_SPOT,
	HEAD_STRING_X,
	POCKET_IDS,
	POCKETS,
	POOL_TABLE,
	type PocketId,
	type PoolBall,
	type PoolShotInput,
} from "@shared/pool";
import { angleTo, anySpot, type PotLine, pathClear, potLines } from "./ai-lines";
import { takeShot } from "./game";
import { nextRandom } from "./rng";
import { isOnEight, type PoolGame, targetsOf } from "./state";

/** How many of the best-looking pots get simulated before choosing. */
const SIMULATED = 8;
/** Every AI shot is off by up to this much, so play looks human and stays reproducible. */
const ANGLE_ERROR = 0.5;
const POWER_ERROR = 0.03;
const R = POOL_TABLE.ballRadius;

export interface AiShot {
	readonly input: PoolShotInput;
	/** The game's seed after the AI's random draws: replay continues from it. */
	readonly seed: number;
}

interface Option {
	readonly input: PoolShotInput;
	readonly score: number;
}

/** How good the table is for the shooter's side after this shot, by actually playing it out. */
function outcomeValue(game: PoolGame, input: PoolShotInput): number {
	const after = takeShot(game, input).game;
	if (game.mode === "practice") {
		if (after.phase === "break") return 10;
		const potted = after.balls.filter((ball) => ball.pocket !== null).length;
		return (
			potted - game.balls.filter((ball) => ball.pocket !== null).length - (after.ballInHand ? 2 : 0)
		);
	}
	if (after.result) {
		if (after.result.winner === null) return -50;
		return after.result.winner === game.turn ? 1_000 : -1_000;
	}
	if (after.ballInHand && after.turn !== game.turn) return -100;
	return after.turn === game.turn ? 100 : 0;
}

function best(
	game: PoolGame,
	options: readonly Option[],
): { option: Option; value: number } | null {
	let chosen: { option: Option; value: number } | null = null;
	for (const option of options) {
		const value = outcomeValue(game, option.input) + option.score;
		if (!chosen || value > chosen.value) chosen = { option, value };
	}
	return chosen;
}

function withCall(game: PoolGame, line: PotLine): Option {
	const call = isOnEight(game) ? { calledPocket: line.pocket } : {};
	return { input: { ...line.input, ...call }, score: line.score };
}

/** The pocket nearest the 8, called when the AI plays a safety on it. */
function nearestPocketTo(ball: PoolBall | undefined): PocketId {
	const distance = (id: PocketId): number =>
		ball ? Math.hypot(POCKETS[id].x - ball.x, POCKETS[id].y - ball.y) : 0;
	return [...POCKET_IDS].sort((a, b) => distance(a) - distance(b))[0] ?? "tr";
}

/** Not a pot: hit a legal ball full in the face at a few strengths, or, failing that, anything at all. */
function safeties(game: PoolGame): Option[] {
	const cueSpot = game.ballInHand
		? anySpot(game.balls, game.ballInHand)
		: game.balls.find((ball) => ball.id === CUE_BALL && ball.pocket === null);
	if (!cueSpot) return [];
	const placed = game.ballInHand ? { cue: { x: cueSpot.x, y: cueSpot.y } } : {};
	const call = isOnEight(game)
		? { calledPocket: nearestPocketTo(game.balls.find((b) => b.id === EIGHT_BALL)) }
		: {};
	const targets = targetsOf(game)
		.map((id) => game.balls.find((ball) => ball.id === id))
		.filter(
			(ball): ball is PoolBall =>
				ball !== undefined && pathClear(game.balls, cueSpot, ball, [CUE_BALL, ball.id]),
		);
	const aims =
		targets.length > 0
			? targets.map((ball) => angleTo(cueSpot, ball))
			: Array.from({ length: 24 }, (_, i) => i * 15);
	return aims.flatMap((angle) =>
		[0.2, 0.35, 0.55].map((power) => ({ input: { angle, power, ...placed, ...call }, score: 0 })),
	);
}

/** The break: cue ball on the head string (seeded side to side), full power at the apex ball. */
function breakShot(game: PoolGame): AiShot {
	const draw = nextRandom(game.seed);
	const cue = { x: HEAD_STRING_X - R, y: (draw.value - 0.5) * 0.4 };
	const power = nextRandom(draw.seed);
	return {
		input: { angle: angleTo(cue, FOOT_SPOT), power: 0.9 + power.value * 0.1, cue },
		seed: power.seed,
	};
}

/** The same small error on every AI shot, drawn from the game's seed. */
function miscue(input: PoolShotInput, seed: number): AiShot {
	const angle = nextRandom(seed);
	const power = nextRandom(angle.seed);
	return {
		input: {
			...input,
			angle: input.angle + (angle.value * 2 - 1) * ANGLE_ERROR,
			power: Math.min(1, Math.max(0.01, input.power * (1 + (power.value * 2 - 1) * POWER_ERROR))),
		},
		seed: power.seed,
	};
}

/**
 * The built-in player: list straight pots (ghost-ball lines, clear paths, cuts
 * up to ~72°), simulate the most promising with the real engine, keep the best
 * outcome for the shooter's side, and fall back to a safety. No model calls.
 */
export function chooseShot(game: PoolGame): AiShot {
	if (game.phase === "break") return breakShot(game);
	const lines = potLines(game.balls, targetsOf(game), game.ballInHand)
		.sort((a, b) => b.score - a.score)
		.slice(0, SIMULATED)
		.map((line) => withCall(game, line));
	const potting = best(game, lines);
	const chosen =
		potting && potting.value >= 50
			? potting
			: (best(game, [...lines, ...safeties(game)]) ?? potting);
	const input = chosen?.option.input ?? {
		angle: 0,
		power: 0.3,
		...(game.ballInHand ? { cue: anySpot(game.balls, game.ballInHand) } : {}),
	};
	return miscue(input, game.seed);
}
