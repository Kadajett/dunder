import { BALL_IDS, type PocketId, type PoolBall } from "@shared/pool";
import type { ShotEvents, Simulation } from "../physics";
import { type GameSide, newGame, type PoolGame } from "../state";

/** Test builders: a table with only the listed balls up (the rest already potted). */
export function table(positions: Readonly<Record<number, readonly [number, number]>>): PoolBall[] {
	return BALL_IDS.map((id) => {
		const at = positions[id];
		return at
			? { id, x: at[0], y: at[1], pocket: null }
			: { id, x: 0, y: 0, pocket: "tl" as PocketId };
	});
}

/** A two-sided game mid-rack: `phase` and groups as given, side 0 to shoot, theo vs mika. */
export function midGame(
	balls: readonly PoolBall[],
	options: {
		readonly phase?: PoolGame["phase"];
		readonly groups?: readonly [GameSide["group"], GameSide["group"]];
		readonly ballInHand?: PoolGame["ballInHand"];
		readonly dryShots?: number;
	} = {},
): PoolGame {
	const game = newGame({ mode: "game", seed: 7, sides: [["theo"], ["mika"]], breaker: 0 });
	const [a, b] = options.groups ?? [null, null];
	return {
		...game,
		balls,
		phase: options.phase ?? (a ? "groups" : "open"),
		sides: [
			{ players: ["theo"], group: a, cursor: 0 },
			{ players: ["mika"], group: b, cursor: 0 },
		],
		ballInHand: options.ballInHand ?? null,
		dryShots: options.dryShots ?? 0,
	};
}

/** What a shot did, without rolling it: for rules tables. Balls listed in `pocketed` end in their pockets. */
export function shot(
	balls: readonly PoolBall[],
	events: Partial<ShotEvents> & { readonly pocketed?: ShotEvents["pocketed"] },
): Simulation {
	const pocketed = events.pocketed ?? [];
	return {
		balls: balls.map((ball) => {
			const drop = pocketed.find((d) => d.id === ball.id);
			return drop ? { ...ball, pocket: drop.pocket } : ball;
		}),
		events: {
			firstContact: events.firstContact ?? null,
			pocketed,
			railAfterContact: events.railAfterContact ?? false,
			objectBallsToRail: events.objectBallsToRail ?? 0,
		},
		frames: [],
	};
}
