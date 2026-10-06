import {
	groupOf,
	JEREMY,
	type PoolGroup,
	type PoolResult,
	type PoolSide,
	type PoolView,
} from "@shared/pool";
import type { Lounge } from "./lounge";
import { isOnEight, type PoolGame, shooterOf } from "./state";

function sidesOf(game: PoolGame): PoolSide[] {
	return game.sides.map((side) => ({
		players: side.players,
		group: side.group,
		left: side.group
			? game.balls
					.filter((ball) => ball.pocket === null && groupOf(ball.id) === side.group)
					.map((ball) => ball.id)
			: [],
	}));
}

function left(sides: readonly PoolSide[], group: PoolGroup): number {
	return sides.find((side) => side.group === group)?.left.length ?? 0;
}

function resultOf(game: PoolGame): PoolResult | null {
	if (!game.result) return null;
	const winner = game.result.winner;
	const players = winner === null ? [] : (game.sides[winner]?.players ?? []);
	return { winner, players, reason: game.result.reason };
}

/** The in-world label: 'theo + nora vs mika · solids 4 left · stripes 6 left', 'mika practising', 'mika wins'. */
function labelOf(lounge: Lounge, sides: readonly PoolSide[], result: PoolResult | null): string {
	const game = lounge.game;
	if (!game || lounge.stage === "resting") return "";
	const names = sides.map((side) => side.players.join(" + "));
	if (lounge.stage === "finished") {
		if (!result || result.winner === null) return "draw";
		return `${result.players.join(" + ")} ${result.players.length === 1 ? "wins" : "win"}`;
	}
	if (game.mode === "practice") return `${names[0] ?? ""} practising`;
	const groups = sides.some((side) => side.group)
		? `solids ${left(sides, "solids")} left · stripes ${left(sides, "stripes")} left`
		: "open table";
	return `${names.join(" vs ")} · ${groups}`;
}

type TurnFields = Pick<PoolView, "turn" | "shooter" | "ballInHand" | "onEight">;

/** Whose shot it is, and how it must be played; all empty unless a game or practice is on. */
function turnOf(lounge: Lounge): TurnFields {
	const game = lounge.game;
	if (lounge.stage !== "playing" || !game) {
		return { turn: null, shooter: null, ballInHand: null, onEight: false };
	}
	return {
		turn: game.turn,
		shooter: shooterOf(game),
		ballInHand: game.ballInHand,
		onEight: isOnEight(game),
	};
}

/** What the renderer and `office-pool state` see of the table. */
export function viewOf(lounge: Lounge, moving: boolean): PoolView {
	const game = lounge.stage === "resting" ? null : lounge.game;
	const sides = game ? sidesOf(game) : [];
	const result = game && lounge.stage === "finished" ? resultOf(game) : null;
	const turn = turnOf(lounge);
	return {
		stage: lounge.stage,
		mode: game?.mode ?? null,
		balls: game?.balls ?? lounge.balls,
		sides,
		...turn,
		moving,
		shot: game?.shots ?? 0,
		queue: lounge.queue,
		last: game?.last ?? null,
		recent: lounge.recent,
		result,
		jeremy: { ...lounge.jeremy, yourTurn: turn.shooter === JEREMY && !moving },
		label: labelOf(lounge, sides, result),
	};
}
