import { JEREMY, type PoolBall, type PoolShotReport } from "@shared/pool";
import { addPlayer, removePlayer } from "./game";
import { nextRandom, shuffle } from "./rng";
import { newGame, type PoolGame } from "./state";
import { rack } from "./table";

/** An agent must be idle or done this long before it walks to the table. */
export const ELIGIBLE_AFTER_MS = 60_000;
/** The winner shows this long before teams re-form. */
export const WINNER_PAUSE_MS = 5_000;
const MAX_SIDE = 3;
const RECENT = 5;

/** One live agent: `free` means idle or done and not open in Jeremy's terminal focus. */
export interface Presence {
	readonly name: string;
	readonly free: boolean;
}

/**
 * The pool table and who is around it, as pure data. Agents are seated by
 * `observe` from their presence; Jeremy by `joinJeremy`/`leaveJeremy`.
 */
export interface Lounge {
	readonly stage: "resting" | "playing" | "finished";
	/** The game being played (or just finished); null while resting. */
	readonly game: PoolGame | null;
	/** Where the balls lie while no game is on. */
	readonly balls: readonly PoolBall[];
	readonly finishedAt: number | null;
	/** Since when each free agent has been free. */
	readonly freeSince: ReadonlyMap<string, number>;
	/** Eligible agents without a seat, longest-waiting first. */
	readonly queue: readonly string[];
	/** The losing side of the last game: its players' new side breaks. */
	readonly losers: readonly string[];
	readonly jeremy: { readonly joined: boolean; readonly viewing: boolean };
	readonly recent: readonly PoolShotReport[];
	readonly seed: number;
}

export function newLounge(seed: number): Lounge {
	const racked = rack(seed);
	return {
		stage: "resting",
		game: null,
		balls: racked.balls,
		finishedAt: null,
		freeSince: new Map(),
		queue: [],
		losers: [],
		jeremy: { joined: false, viewing: false },
		recent: [],
		seed: racked.seed,
	};
}

export function seated(lounge: Lounge): string[] {
	return lounge.game && lounge.stage === "playing"
		? lounge.game.sides.flatMap((side) => side.players)
		: [];
}

function eligible(lounge: Lounge, now: number): string[] {
	const sitting = seated(lounge);
	return [...lounge.freeSince]
		.filter(([name, since]) => now - since >= ELIGIBLE_AFTER_MS && !sitting.includes(name))
		.map(([name]) => name);
}

function finish(lounge: Lounge, game: PoolGame, now: number): Lounge {
	const winner = game.result?.winner;
	const losers =
		winner === null || winner === undefined ? [] : (game.sides[1 - winner]?.players ?? []);
	return {
		...lounge,
		stage: "finished",
		game,
		finishedAt: now,
		balls: game.balls,
		losers: [...losers],
	};
}

/** Put a game (or its end) on the table. */
export function withGame(lounge: Lounge, game: PoolGame, now: number): Lounge {
	const recent =
		game.last && game.last !== lounge.game?.last
			? [...lounge.recent, game.last].slice(-RECENT)
			: lounge.recent;
	const next = { ...lounge, game, balls: game.balls, recent };
	return game.result && lounge.stage === "playing" ? finish(next, game, now) : next;
}

function rest(lounge: Lounge): Lounge {
	return { ...lounge, stage: "resting", game: null, finishedAt: null };
}

/**
 * Sides as even as possible, up to three each (2 → 1v1, 3 → 1v1 + 1 queued,
 * 4 → 2v2, 5 → 2v2 + 1, 6+ → 3v3), re-shuffled every game; the last losers' side breaks.
 * `players` is in priority order: whoever doesn't fit queues.
 */
function formGame(lounge: Lounge, players: readonly string[]): Lounge {
	const count = Math.min(2 * MAX_SIDE, players.length - (players.length % 2));
	const shuffled = shuffle(players.slice(0, count), lounge.seed);
	const sides = [shuffled.items.slice(0, count / 2), shuffled.items.slice(count / 2)];
	const coin = nextRandom(shuffled.seed);
	const loserSide = sides.findIndex((side) => side.some((name) => lounge.losers.includes(name)));
	const breaker = loserSide >= 0 ? loserSide : coin.value < 0.5 ? 0 : 1;
	const game = newGame({ mode: "game", seed: coin.seed, sides, breaker });
	const queue = players.slice(count);
	return {
		...lounge,
		stage: "playing",
		game,
		balls: game.balls,
		finishedAt: null,
		queue,
		seed: game.seed,
		recent: [],
	};
}

function practice(lounge: Lounge, name: string): Lounge {
	const game = newGame({ mode: "practice", seed: lounge.seed, sides: [[name]], breaker: 0 });
	return {
		...lounge,
		stage: "playing",
		game,
		balls: game.balls,
		finishedAt: null,
		queue: [],
		seed: game.seed,
		recent: [],
	};
}

/** Who plays next: Jeremy when he has joined, queued agents (longest waiting), then the other eligible agents by seed. */
function candidates(lounge: Lounge, now: number): { names: string[]; seed: number } {
	const ready = eligible(lounge, now);
	const queued = lounge.queue.filter((name) => ready.includes(name));
	const others = shuffle(
		ready.filter((name) => !queued.includes(name)),
		lounge.seed,
	);
	const jeremy = lounge.jeremy.joined ? [JEREMY] : [];
	return { names: [...jeremy, ...queued, ...others.items], seed: others.seed };
}

/** Start whatever the eligible agents (and Jeremy) can play on a table with no game: a game, practice, or nothing. */
function form(lounge: Lounge, now: number): Lounge {
	const { names, seed } = candidates(lounge, now);
	const next = { ...lounge, seed };
	const [first] = names;
	if (first === undefined) return rest(next);
	return names.length === 1 ? practice(next, first) : formGame(next, names);
}

function smallerSide(game: PoolGame): number {
	const [a, b] = game.sides.map((side) => side.players.length);
	return (a ?? 0) <= (b ?? 0) ? 0 : 1;
}

/**
 * Mid-game newcomers (queued first) keep the sides even, up to three a side:
 * one fills a side that is short, two take a seat each; whoever is left queues.
 */
function seatNewcomers(lounge: Lounge, game: PoolGame, now: number): Lounge {
	const ready = eligible(lounge, now);
	let waiting = [
		...lounge.queue.filter((name) => ready.includes(name)),
		...ready.filter((name) => !lounge.queue.includes(name)),
	];
	let seatedGame = game;
	for (;;) {
		const [a = 0, b = 0] = seatedGame.sides.map((side) => side.players.length);
		const [first, second] = waiting;
		if (Math.min(a, b) >= MAX_SIDE || first === undefined) break;
		if (a !== b) seatedGame = addPlayer(seatedGame, smallerSide(seatedGame), first);
		else if (second !== undefined)
			seatedGame = addPlayer(addPlayer(seatedGame, 0, first), 1, second);
		else break;
		waiting = waiting.slice(a !== b ? 1 : 2);
	}
	return { ...lounge, game: seatedGame, queue: waiting };
}

/** When the clock alone can next change the table (an agent's minute is up, the winner pause ends), or null. */
export function nextChangeAt(lounge: Lounge, now: number): number | null {
	const sitting = seated(lounge);
	const due = [
		...(lounge.stage === "finished" && lounge.finishedAt !== null
			? [lounge.finishedAt + WINNER_PAUSE_MS]
			: []),
		...[...lounge.freeSince]
			.filter(([name]) => !sitting.includes(name))
			.map(([, since]) => since + ELIGIBLE_AFTER_MS),
	].filter((at) => at > now);
	return due.length > 0 ? Math.min(...due) : null;
}

/** Bring the table up to date with the clock: re-form after the winner pause, seat or queue newcomers. */
export function arrange(lounge: Lounge, now: number): Lounge {
	const game = lounge.game;
	if (lounge.stage === "finished") {
		return now - (lounge.finishedAt ?? now) >= WINNER_PAUSE_MS ? form(lounge, now) : lounge;
	}
	if (lounge.stage === "resting" || !game) return form(lounge, now);
	if (game.mode === "game") return seatNewcomers(lounge, game, now);
	const waiting = eligible(lounge, now);
	// Jeremy practises alone (agents queue); an agent practising gets company and a game forms.
	if (game.sides[0]?.players[0] === JEREMY)
		return {
			...lounge,
			queue: [...lounge.queue, ...waiting.filter((n) => !lounge.queue.includes(n))],
		};
	return waiting.length > 0 ? form(rest(lounge), now) : lounge;
}

/** Track who is free; anyone who isn't any more leaves the table at once (an emptied side forfeits). */
export function observe(lounge: Lounge, presences: readonly Presence[], now: number): Lounge {
	const free = new Map(
		presences
			.filter((presence) => presence.free && presence.name !== JEREMY)
			.map((presence) => [presence.name, lounge.freeSince.get(presence.name) ?? now]),
	);
	const queue = lounge.queue.filter((name) => free.has(name));
	let next: Lounge = { ...lounge, freeSince: free, queue };
	const leavers = seated(next).filter((name) => name !== JEREMY && !free.has(name));
	for (const name of leavers) next = unseat(next, name, now);
	return arrange(next, now);
}

function unseat(lounge: Lounge, name: string, now: number): Lounge {
	const game = lounge.game;
	if (!game) return lounge;
	if (game.mode === "practice") return rest(lounge);
	return withGame(lounge, removePlayer(game, name), now);
}

/** Jeremy joins the smaller side of a running game (it may reach four), takes over an agent's practice as a game, or practises alone. */
export function joinJeremy(lounge: Lounge, now: number): Lounge {
	const joined = { ...lounge, jeremy: { ...lounge.jeremy, joined: true } };
	const game = lounge.game;
	if (lounge.stage !== "playing" || !game) return arrange(joined, now);
	if (seated(lounge).includes(JEREMY)) return joined;
	if (game.mode === "practice") return form(rest(joined), now);
	return { ...joined, game: addPlayer(game, smallerSide(game), JEREMY) };
}

export function leaveJeremy(lounge: Lounge, now: number): Lounge {
	const left = { ...lounge, jeremy: { ...lounge.jeremy, joined: false } };
	if (!seated(lounge).includes(JEREMY)) return left;
	return arrange(unseat(left, JEREMY, now), now);
}
