import type { SessionSnapshot } from "@shared/herdr/schema";
import { createLogger } from "@shared/log/logger";
import {
	JEREMY,
	type PoolActionResult,
	type PoolFrame,
	type PoolShotInput,
	type PoolView,
	VIEWING_GRACE_MS,
} from "@shared/pool";
import { chooseShot } from "./ai";
import { shotProblem, takeShot } from "./game";
import {
	arrange,
	joinJeremy,
	type Lounge,
	leaveJeremy,
	newLounge,
	nextChangeAt,
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

export interface PoolDeps {
	readonly seed: number;
	readonly emit: (view: PoolView) => void;
	readonly emitFrame: (frame: PoolFrame) => void;
	/** Whether Jeremy has this pane open in terminal focus (its agent isn't free to play). */
	readonly isOpen: (paneId: string) => boolean;
	/** Whether the agent takes part in the running brainstorm (it stays at the whiteboard). */
	readonly inBrainstorm: (name: string) => boolean;
	/** Where `office-pool state` reads the table. */
	readonly saveDigest: (view: PoolView) => Promise<void>;
	readonly now?: () => number;
}

interface Flight {
	/** The table once the balls stop; seating changes during the roll apply to it too. */
	next: Lounge;
	readonly frames: readonly PoolFrame[];
	readonly startedAt: number;
	/** When the last frame plays: the table's clock while the balls roll. */
	readonly landsAt: number;
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
	/** The AI's next shot: whose game, how long it waited for Jeremy (`until`), when it fires. */
	#turn:
		| {
				readonly game: PoolGame;
				readonly until: number;
				readonly at: number;
				readonly timer: NodeJS.Timeout;
		  }
		| undefined;
	/** Jeremy's shot is his until then: the last table-view ping or his leaving it, plus the grace. */
	#viewingUntil = 0;
	#tick: NodeJS.Timeout | undefined;
	#lastView = "";
	#started = false;

	constructor(deps: PoolDeps) {
		this.#deps = deps;
		this.#now = deps.now ?? Date.now;
		this.#lounge = newLounge(deps.seed);
	}

	start(): void {
		this.#started = true;
		this.#changed();
	}

	stop(): void {
		this.#started = false;
		clearTimeout(this.#tick);
		clearInterval(this.#playback);
		this.#cancelTurn();
		this.#tick = undefined;
		this.#playback = undefined;
	}

	view(): PoolView {
		const turn = this.#turn;
		const autopilot =
			turn && !this.#lounge.jeremy.viewing && shooterOf(turn.game) === JEREMY ? turn.at : null;
		return viewOf(this.#lounge, this.#flight !== null, autopilot);
	}

	updateSnapshot(snapshot: SessionSnapshot): void {
		this.#presences = snapshot.agents.flatMap((agent) =>
			agent.name
				? [
						{
							name: agent.name,
							free:
								(agent.agent_status === "idle" || agent.agent_status === "done") &&
								!this.#deps.isOpen(agent.pane_id) &&
								!this.#deps.inBrainstorm(agent.name),
						},
					]
				: [],
		);
		this.#apply((lounge, now) => observe(lounge, this.#presences, now));
	}

	join(): PoolActionResult {
		this.#apply((lounge, now) => joinJeremy(lounge, now));
		return { ok: true };
	}

	leave(): PoolActionResult {
		if (!this.#lounge.jeremy.joined) return { ok: false, reason: "you're not at the table" };
		this.#apply((lounge, now) => leaveJeremy(lounge, now));
		return { ok: true };
	}

	/**
	 * A table-view ping (`true`) or its closing (`false`). Either way Jeremy's
	 * shot waits `VIEWING_GRACE_MS` from now, whatever the window's focus: the
	 * engine plays it only once the pings have stopped for that long.
	 */
	setViewing(viewing: boolean): void {
		this.#viewingUntil = this.#now() + VIEWING_GRACE_MS;
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

	/**
	 * Change the table (and the table the rolling shot will leave), then publish
	 * and plan. While balls roll the table's clock stands at the moment they stop,
	 * so a game that ends meanwhile shows its winner for the full pause after that.
	 */
	#apply(change: (lounge: Lounge, now: number) => Lounge): void {
		const flight = this.#flight;
		const now = flight ? Math.max(this.#now(), flight.landsAt) : this.#now();
		this.#lounge = change(this.#lounge, now);
		if (flight) flight.next = change(flight.next, now);
		this.#changed();
	}

	#changed(): void {
		// Plan first: the view carries the autopilot's time.
		this.#plan();
		const view = this.view();
		const text = JSON.stringify(view);
		if (text !== this.#lastView) {
			this.#lastView = text;
			this.#deps.emit(view);
			this.#deps
				.saveDigest(view)
				.catch((error: unknown) => log.warn("cannot save the pool digest", { error }));
		}
		this.#wake();
	}

	/** Re-check the table when the clock alone changes it next (eligibility, winner pause). */
	#wake(): void {
		clearTimeout(this.#tick);
		this.#tick = undefined;
		const now = this.#now();
		const at = this.#started ? nextChangeAt(this.#lounge, now) : null;
		if (at === null) return;
		this.#tick = setTimeout(
			() => this.#apply((lounge, time) => observe(lounge, this.#presences, time)),
			at - now,
		);
	}

	/**
	 * Schedule the AI's shot: an agent's, or Jeremy's on autopilot. His waits
	 * until the grace after his table view's last ping has run out, so it moves
	 * on with every ping and never fires while the view is open.
	 */
	#plan(): void {
		const game = this.#lounge.game;
		const due = this.#lounge.stage === "playing" && game && !game.result && !this.#flight;
		if (!due) {
			this.#cancelTurn();
			return;
		}
		const until = shooterOf(game) === JEREMY ? this.#viewingUntil : 0;
		if (this.#turn?.game === game && this.#turn.until === until) return;
		this.#cancelTurn();
		const delay = game.shots === 0 ? WALK_MS : THINK_MS + nextRandom(game.seed).value * THINK_MS;
		const now = this.#now();
		const at = Math.max(now, until) + delay;
		const timer = setTimeout(() => {
			this.#turn = undefined;
			const ai = chooseShot(game);
			this.#strike({ ...game, seed: ai.seed }, ai.input);
		}, at - now);
		this.#turn = { game, until, at, timer };
	}

	#cancelTurn(): void {
		if (this.#turn) clearTimeout(this.#turn.timer);
		this.#turn = undefined;
	}

	#strike(game: PoolGame, input: PoolShotInput): void {
		const taken = takeShot(game, input, { frames: true });
		const now = this.#now();
		const landsAt = now + (taken.simulation.frames.length - 1) * FRAME_MS;
		this.#flight = {
			next: withGame(this.#lounge, taken.game, landsAt),
			frames: taken.simulation.frames,
			startedAt: now,
			landsAt,
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
		this.#apply((lounge, now) => arrange(lounge, now));
	}
}
