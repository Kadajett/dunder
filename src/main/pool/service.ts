import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import {
	JEREMY,
	type PoolActionResult,
	type PoolFrame,
	type PoolShotInput,
	type PoolView,
} from "@shared/pool";
import { chooseShot } from "./ai";
import { shotProblem, takeShot } from "./game";
import {
	arrange,
	joinJeremy,
	type Lounge,
	leaveJeremy,
	newLounge,
	observe,
	type Presence,
	withGame,
} from "./lounge";
import { nextRandom } from "./rng";
import { type PoolGame, shooterOf } from "./state";
import { viewOf } from "./view";

const log = createLogger("pool");

/** Players walk from their desks before a game's first shot. */
export const WALK_MS = 8_000;
/** The AI thinks 2-4 s (seeded) before each shot, so it reads like play. */
const THINK_MS = 2_000;
const FRAME_MS = 1_000 / 30;
/** Eligibility is time-based (60 s idle), so the table re-checks the clock this often. */
const TICK_MS = 1_000;

export interface PoolDeps {
	readonly seed: number;
	readonly emit: (view: PoolView) => void;
	readonly emitFrame: (frame: PoolFrame) => void;
	/** Whether Jeremy has this pane open in terminal focus (its agent isn't free to play). */
	readonly isOpen: (paneId: string) => boolean;
	/** Where `office-pool state` reads the table. */
	readonly saveDigest: (view: PoolView) => Promise<void>;
	readonly now?: () => number;
}

interface Flight {
	/** The table once the balls stop; seating changes during the roll apply to it too. */
	next: Lounge;
	readonly frames: readonly PoolFrame[];
	readonly startedAt: number;
}

/**
 * The office pool table, owned by main: idle agents play 8-ball with the
 * built-in AI (no model calls), Jeremy joins from the app. Shots are decided
 * at once and played back to the renderer at ~30 Hz.
 */
export class PoolService {
	readonly #deps: PoolDeps;
	readonly #now: () => number;
	#lounge: Lounge;
	#presences: readonly Presence[] = [];
	#flight: Flight | null = null;
	#playback: NodeJS.Timeout | undefined;
	#turn: { readonly game: PoolGame; readonly timer: NodeJS.Timeout } | undefined;
	#tick: NodeJS.Timeout | undefined;
	#lastView = "";

	constructor(deps: PoolDeps) {
		this.#deps = deps;
		this.#now = deps.now ?? Date.now;
		this.#lounge = newLounge(deps.seed);
	}

	start(): void {
		this.#tick ??= setInterval(
			() => this.#apply((lounge) => observe(lounge, this.#presences, this.#now())),
			TICK_MS,
		);
		this.#changed();
	}

	stop(): void {
		clearInterval(this.#tick);
		clearInterval(this.#playback);
		if (this.#turn) clearTimeout(this.#turn.timer);
		this.#tick = undefined;
		this.#playback = undefined;
		this.#turn = undefined;
	}

	view(): PoolView {
		return viewOf(this.#lounge, this.#flight !== null);
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#presences = snapshot.agents.flatMap((agent) =>
			agent.name
				? [
						{
							name: agent.name,
							free:
								(agent.agent_status === "idle" || agent.agent_status === "done") &&
								!this.#deps.isOpen(agent.pane_id),
						},
					]
				: [],
		);
		this.#apply((lounge) => observe(lounge, this.#presences, this.#now()));
	}

	join(): PoolActionResult {
		this.#apply((lounge) => joinJeremy(lounge, this.#now()));
		return { ok: true };
	}

	leave(): PoolActionResult {
		if (!this.#lounge.jeremy.joined) return { ok: false, reason: "you're not at the table" };
		this.#apply((lounge) => leaveJeremy(lounge, this.#now()));
		return { ok: true };
	}

	setViewing(viewing: boolean): void {
		this.#apply((lounge) => ({ ...lounge, jeremy: { ...lounge.jeremy, viewing } }));
	}

	shoot(input: PoolShotInput): PoolActionResult {
		const game = this.#lounge.game;
		if (this.#flight) return { ok: false, reason: "wait for the balls to stop" };
		if (this.#lounge.stage !== "playing" || !game) return { ok: false, reason: "no game is on" };
		if (shooterOf(game) !== JEREMY) return { ok: false, reason: "it's not your shot" };
		const problem = shotProblem(game, input);
		if (problem) return { ok: false, reason: problem };
		this.#strike(game, input);
		return { ok: true };
	}

	/** Change the table (and the table the rolling shot will leave), then publish and plan the next shot. */
	#apply(change: (lounge: Lounge) => Lounge): void {
		this.#lounge = change(this.#lounge);
		if (this.#flight) this.#flight.next = change(this.#flight.next);
		this.#changed();
	}

	#changed(): void {
		const view = this.view();
		const text = JSON.stringify(view);
		if (text !== this.#lastView) {
			this.#lastView = text;
			this.#deps.emit(view);
			this.#deps
				.saveDigest(view)
				.catch((error: unknown) => log.warn("cannot save the pool digest", { error }));
		}
		this.#plan();
	}

	/** Schedule the AI's shot (an agent's, or Jeremy's on autopilot while he's out of table view). */
	#plan(): void {
		const game = this.#lounge.game;
		const due = this.#lounge.stage === "playing" && game && !game.result && !this.#flight;
		const human = game && shooterOf(game) === JEREMY && this.#lounge.jeremy.viewing;
		if (!due || human) {
			if (this.#turn) clearTimeout(this.#turn.timer);
			this.#turn = undefined;
			return;
		}
		if (this.#turn?.game === game) return;
		if (this.#turn) clearTimeout(this.#turn.timer);
		const delay = game.shots === 0 ? WALK_MS : THINK_MS + nextRandom(game.seed).value * THINK_MS;
		const timer = setTimeout(() => {
			this.#turn = undefined;
			const ai = chooseShot(game);
			this.#strike({ ...game, seed: ai.seed }, ai.input);
		}, delay);
		this.#turn = { game, timer };
	}

	#strike(game: PoolGame, input: PoolShotInput): void {
		const taken = takeShot(game, input, { frames: true });
		const now = this.#now();
		this.#flight = {
			next: withGame(this.#lounge, taken.game, now),
			frames: taken.simulation.frames,
			startedAt: now,
		};
		this.#changed();
		this.#playback = setInterval(() => this.#play(), FRAME_MS);
		this.#play();
	}

	#play(): void {
		const flight = this.#flight;
		if (!flight) return;
		const index = Math.floor((this.#now() - flight.startedAt) / FRAME_MS);
		const frame = flight.frames[Math.min(index, flight.frames.length - 1)];
		if (frame) this.#deps.emitFrame(frame);
		if (index < flight.frames.length - 1) return;
		clearInterval(this.#playback);
		this.#playback = undefined;
		this.#flight = null;
		this.#lounge = flight.next;
		this.#apply((lounge) => arrange(lounge, this.#now()));
	}
}
