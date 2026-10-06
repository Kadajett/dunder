import { CUE_BALL, EIGHT_BALL, groupOf, type PoolGroup, type PoolShotInput } from "@shared/pool";
import type { Simulation } from "./physics";
import {
	type GameResult,
	type GameSide,
	isOnEight,
	type PoolGame,
	shooterOf,
	targetsOf,
} from "./state";
import { onTable, rack, respotEight } from "./table";

/** Shots in a row without a pot before the game is called a draw. */
export const STALEMATE_SHOTS = 40;

const OTHER: Readonly<Record<PoolGroup, PoolGroup>> = { solids: "stripes", stripes: "solids" };

interface Outcome {
	/** The shooter's side shoots again. */
	readonly continues: boolean;
	readonly foul: string | null;
	readonly result: GameResult | null;
	/** What follows the pots in the shot report, e.g. 'stripes continue'. */
	readonly text: string;
}

function sideName(side: GameSide | undefined): string {
	if (!side) return "nobody";
	return side.group ?? side.players.join(" + ");
}

function objectPots(simulation: Simulation): number[] {
	return simulation.events.pocketed.map((drop) => drop.id).filter((id) => id !== CUE_BALL);
}

/** End the visit or keep it: rotate the side's shooter when its visit ends, pass the turn on a miss. */
function nextTurn(game: PoolGame, outcome: Outcome): Pick<PoolGame, "turn" | "sides"> {
	if (outcome.continues || game.sides.length < 2) return { turn: game.turn, sides: game.sides };
	const sides = game.sides.map((side, i) =>
		i === game.turn ? { ...side, cursor: side.cursor + 1 } : side,
	);
	return { turn: 1 - game.turn, sides };
}

function report(game: PoolGame, simulation: Simulation, text: string): PoolGame["last"] {
	const pots = objectPots(simulation);
	const potted = pots.length > 0 ? `potted ${pots.join(", ")}` : "no pot";
	return { by: shooterOf(game) ?? "?", text: `${shooterOf(game) ?? "?"}: ${potted} · ${text}` };
}

/** Rules 2-4: a break must pot a ball or drive four to a rail; a scratch gives ball in hand in the kitchen. */
function judgeBreak(game: PoolGame, simulation: Simulation): PoolGame {
	const pots = objectPots(simulation);
	const scratch = simulation.events.pocketed.some((drop) => drop.id === CUE_BALL);
	const opponent = game.sides[1 - game.turn];
	const dryShots = pots.length > 0 ? 0 : game.dryShots + 1;
	if (pots.length === 0 && simulation.events.objectBallsToRail < 4) {
		const racked = rack(game.seed);
		const outcome = { continues: false, foul: null, result: null, text: "" };
		return {
			...game,
			...nextTurn(game, outcome),
			seed: racked.seed,
			balls: racked.balls,
			ballInHand: "kitchen",
			shots: game.shots + 1,
			dryShots,
			last: report(game, simulation, `illegal break · ${sideName(opponent)} re-rack and break`),
		};
	}
	const balls = pots.includes(EIGHT_BALL) ? respotEight(simulation.balls) : simulation.balls;
	const eight = pots.includes(EIGHT_BALL) ? "8 re-spotted · " : "";
	const outcome: Outcome = scratch
		? {
				continues: false,
				foul: "scratch",
				result: null,
				text: `foul: scratch on the break · ball in hand behind the head string for ${sideName(opponent)}`,
			}
		: {
				continues: pots.length > 0,
				foul: null,
				result: null,
				text: pots.length > 0 ? "break continues" : `turn to ${sideName(opponent)}`,
			};
	return {
		...game,
		...nextTurn(game, outcome),
		balls,
		phase: "open",
		ballInHand: scratch ? "kitchen" : null,
		shots: game.shots + 1,
		dryShots,
		last: report(game, simulation, `${eight}${outcome.text}`),
	};
}

/** Rules 7 and 10: the first contact must be a legal target, and something must drop or reach a rail after it. */
function foulOf(game: PoolGame, simulation: Simulation): string | null {
	const { events } = simulation;
	if (events.pocketed.some((drop) => drop.id === CUE_BALL)) return "scratch";
	if (events.firstContact === null) return "no ball hit";
	if (!targetsOf(game).includes(events.firstContact)) return `hit the ${events.firstContact} first`;
	if (objectPots(simulation).length === 0 && !events.railAfterContact)
		return "no rail after contact";
	return null;
}

/** Rules 11-12: the 8 wins only legally, on the 8, in the called pocket. */
function eightOutcome(
	game: PoolGame,
	input: PoolShotInput,
	simulation: Simulation,
	foul: string | null,
): Outcome {
	const drop = simulation.events.pocketed.find((d) => d.id === EIGHT_BALL);
	const lose = (reason: string): Outcome => ({
		continues: false,
		foul,
		result: { winner: 1 - game.turn, reason },
		text: `loses: ${reason}`,
	});
	if (foul) return lose(`8 down on a foul (${foul})`);
	if (!isOnEight(game)) return lose("8 down before the group was cleared");
	if (drop?.pocket !== input.calledPocket)
		return lose(`8 in ${drop?.pocket}, called ${input.calledPocket}`);
	const reason = `8 in the called pocket (${drop?.pocket})`;
	return {
		continues: false,
		foul: null,
		result: { winner: game.turn, reason },
		text: `wins: ${reason}`,
	};
}

/** Rule 6: on an open table the first legally potted ball decides the groups. */
function assignGroups(
	game: PoolGame,
	simulation: Simulation,
	foul: string | null,
): readonly GameSide[] {
	if (foul || game.phase !== "open") return game.sides;
	const first = objectPots(simulation)
		.map((id) => groupOf(id))
		.find((group) => group !== undefined);
	if (!first) return game.sides;
	return game.sides.map((side, i) => ({ ...side, group: i === game.turn ? first : OTHER[first] }));
}

function playOutcome(game: PoolGame, simulation: Simulation, foul: string | null): Outcome {
	const group = game.sides[game.turn]?.group;
	const own = objectPots(simulation).filter((id) => group && groupOf(id) === group);
	const opponent = game.sides[1 - game.turn];
	if (foul) {
		return {
			continues: false,
			foul,
			result: null,
			text: `foul: ${foul} · ball in hand for ${sideName(opponent)}`,
		};
	}
	if (own.length > 0) return { continues: true, foul, result: null, text: `${group} continue` };
	return { continues: false, foul, result: null, text: `turn to ${sideName(opponent)}` };
}

/** Rules 5-13 for every shot after the break. */
function judgePlay(game: PoolGame, input: PoolShotInput, simulation: Simulation): PoolGame {
	const foul = foulOf(game, simulation);
	const pots = objectPots(simulation);
	const sides = assignGroups(game, simulation, foul);
	const grouped = { ...game, sides };
	const outcome = pots.includes(EIGHT_BALL)
		? eightOutcome(game, input, simulation, foul)
		: playOutcome(grouped, simulation, foul);
	const dryShots = pots.length > 0 ? 0 : game.dryShots + 1;
	const stalemate = !outcome.result && dryShots >= STALEMATE_SHOTS;
	const result = stalemate
		? { winner: null, reason: `${STALEMATE_SHOTS} shots without a pot` }
		: outcome.result;
	return {
		...grouped,
		...nextTurn(grouped, outcome),
		balls: simulation.balls,
		phase: sides.some((side) => side.group) ? "groups" : "open",
		ballInHand: outcome.foul && !result ? "anywhere" : null,
		shots: game.shots + 1,
		dryShots,
		result,
		last: report(game, simulation, stalemate ? "draw: stalemate" : outcome.text),
	};
}

/** Practice: no fouls; a scratch gives ball in hand anywhere and an empty table re-racks. */
function judgePractice(game: PoolGame, simulation: Simulation): PoolGame {
	const scratch = simulation.events.pocketed.some((drop) => drop.id === CUE_BALL);
	const cleared = onTable(simulation.balls).every((ball) => ball.id === CUE_BALL);
	const racked = cleared ? rack(game.seed) : null;
	const text = racked ? "table cleared · re-rack" : scratch ? "scratch · ball in hand" : "practice";
	return {
		...game,
		seed: racked?.seed ?? game.seed,
		balls: racked?.balls ?? simulation.balls,
		phase: racked ? "break" : "open",
		ballInHand: racked ? "kitchen" : scratch ? "anywhere" : null,
		shots: game.shots + 1,
		last: report(game, simulation, text),
	};
}

/** The table after a shot: balls where they stopped, plus turn, groups, ball in hand and result per the rules. */
export function judge(game: PoolGame, input: PoolShotInput, simulation: Simulation): PoolGame {
	if (game.mode === "practice") return judgePractice(game, simulation);
	if (game.phase === "break") return judgeBreak(game, simulation);
	return judgePlay(game, input, simulation);
}
