import { createLogger } from "@shared/log/logger";
import type { HumanAsk, WorkBoard, WorkLane, WorkPriority, WorkResult } from "@shared/work-board";
import { z } from "zod";
import type { BdRunner } from "../beads/bd";
import { buildAsks } from "./asks";
import { buildCards, parseBeads } from "./cards";

const log = createLogger("work-board");

/** How often bd is re-read; agents and the CLI change beads behind the app's back. */
export const WORK_POLL_MS = 5_000;
/** The Done lane looks back this far. */
const DONE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WorkBoardDeps {
	readonly runBd: BdRunner;
	/** The repo whose Beads the board shows. */
	readonly cwd: string;
	readonly now: () => number;
	/** Run `callback` once after `ms`; returns a cancel. */
	readonly setTimer: (callback: () => void, ms: number) => () => void;
	readonly emit: (board: WorkBoard) => void;
	/** Tell an agent something as an office message (delivered once it is free). */
	readonly notify: (agent: string, text: string) => void;
}

/** A board as read from bd, before main stamps its revision. */
type BoardContent =
	| Omit<Extract<WorkBoard, { state: "ok" }>, "revision">
	| Extract<WorkBoard, { state: "unavailable" }>;

const showSchema = z.array(z.object({ status: z.string() })).min(1);

/** The bd commands that put a bead with `status` into `lane`, in order. */
export function movePlan(id: string, status: string, lane: WorkLane): string[][] {
	const closed = status === "closed";
	if (lane === "done") return closed ? [] : [["close", id]];
	const reopen = closed ? [["reopen", id]] : [];
	if (lane === "ready") return closed ? reopen : [["update", id, "--status=open"]];
	return [...reopen, ["update", id, `--status=${lane}`]];
}

const reasonOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The left bar's work board: polls bd every `WORK_POLL_MS` (never two reads at
 * once), emits the board only when it changed, and runs Jeremy's writes as bd
 * commands, each followed by an immediate refresh.
 */
export class WorkBoardService {
	readonly #deps: WorkBoardDeps;
	#board: WorkBoard | undefined;
	#emitted = "";
	/** Revision of the last changed board sent; stamps the next one. */
	#revision = 0;
	#running: Promise<void> | undefined;
	#queued: Promise<void> | undefined;
	#started = false;
	#cancelTimer: (() => void) | undefined;

	constructor(deps: WorkBoardDeps) {
		this.#deps = deps;
	}

	start(): void {
		if (this.#started) return;
		this.#started = true;
		void this.#tick();
	}

	stop(): void {
		this.#started = false;
		this.#cancelTimer?.();
		this.#cancelTimer = undefined;
	}

	async get(): Promise<WorkBoard> {
		if (!this.#board) await this.refresh();
		return this.#board ?? { state: "unavailable", reason: "not loaded" };
	}

	/** Re-read bd now; a call while a read runs waits for one more read after it. */
	refresh(): Promise<void> {
		const running = this.#running;
		if (running) {
			this.#queued ??= running.then(() => {
				this.#queued = undefined;
				return this.refresh();
			});
			return this.#queued;
		}
		const next = this.#load().finally(() => {
			this.#running = undefined;
		});
		this.#running = next;
		return next;
	}

	create(title: string): Promise<WorkResult> {
		return this.#write([["create", `--title=${title}`, "--type=task", "--priority=2"]]);
	}

	setPriority(id: string, priority: WorkPriority): Promise<WorkResult> {
		return this.#write([["update", id, `--priority=${priority}`]]);
	}

	async move(id: string, lane: WorkLane): Promise<WorkResult> {
		try {
			const [bead] = showSchema.parse(JSON.parse(await this.#bd(["show", id, "--json"])));
			return await this.#write(movePlan(id, bead?.status ?? "", lane));
		} catch (error) {
			return { ok: false, reason: reasonOf(error) };
		}
	}

	assign(id: string, assignee: string | null): Promise<WorkResult> {
		return this.#write([["update", id, `--assignee=${assignee ?? ""}`]]);
	}

	/**
	 * Answer an ask: the response becomes a comment, then the ask closes. (bd's
	 * own `human respond` does the same but fails with "storage is nil" in bd 1.1.2.)
	 */
	async respond(id: string, response: string): Promise<WorkResult> {
		const ask = this.#ask(id);
		const result = await this.#write([
			["comments", "add", id, "--", response],
			["close", id, "--reason=Responded"],
		]);
		if (result.ok && ask?.asker)
			this.#deps.notify(
				ask.asker,
				`Jeremy answered your ask ${id} ("${ask.question}"): ${response}`,
			);
		return result;
	}

	/** Close an ask unanswered (bd's `human dismiss` has the same bd 1.1.2 bug). */
	async dismiss(id: string): Promise<WorkResult> {
		const ask = this.#ask(id);
		const result = await this.#write([["close", id, "--reason=Dismissed"]]);
		if (result.ok && ask?.asker)
			this.#deps.notify(
				ask.asker,
				`Jeremy dismissed your ask ${id} ("${ask.question}") without an answer.`,
			);
		return result;
	}

	#ask(id: string): HumanAsk | undefined {
		return this.#board?.state === "ok" ? this.#board.asks.find((ask) => ask.id === id) : undefined;
	}

	async #tick(): Promise<void> {
		await this.refresh();
		if (this.#started)
			this.#cancelTimer = this.#deps.setTimer(() => void this.#tick(), WORK_POLL_MS);
	}

	#bd(args: readonly string[]): Promise<string> {
		return this.#deps.runBd(args, this.#deps.cwd);
	}

	async #write(steps: readonly (readonly string[])[]): Promise<WorkResult> {
		let failure: string | undefined;
		try {
			for (const args of steps) await this.#bd(args);
		} catch (error) {
			failure = reasonOf(error);
			log.warn("bd write failed", { steps, error });
		}
		// Sends the board with the write (if it changed anything) before the result goes back.
		await this.refresh();
		return failure === undefined
			? { ok: true, revision: this.#revision }
			: { ok: false, reason: failure };
	}

	async #load(): Promise<void> {
		const content = await this.#read();
		const serialized = JSON.stringify(content);
		if (serialized === this.#emitted) return;
		if (content.state === "unavailable") log.warn("bd unavailable", { reason: content.reason });
		this.#emitted = serialized;
		if (content.state === "ok") this.#revision += 1;
		const board: WorkBoard =
			content.state === "ok" ? { ...content, revision: this.#revision } : content;
		this.#board = board;
		this.#deps.emit(board);
	}

	async #read(): Promise<BoardContent> {
		try {
			const since = new Date(this.#deps.now() - DONE_WINDOW_MS).toISOString();
			// One at a time: parallel bd runs serialize on the Dolt database anyway (no faster).
			const open = await this.#bd([
				"list",
				"--json",
				"--status=open,in_progress,blocked",
				"-n",
				"0",
			]);
			const blocked = await this.#bd(["blocked", "--json"]);
			const ready = await this.#bd(["ready", "--json", "-n", "0"]);
			const closed = await this.#bd([
				"list",
				"--json",
				"--status=closed",
				`--closed-after=${since}`,
				"-n",
				"0",
			]);
			const openBeads = parseBeads(open);
			const cards = buildCards({
				open: openBeads,
				blocked: parseBeads(blocked),
				ready: parseBeads(ready),
				closed: parseBeads(closed),
			});
			return { state: "ok", cards, asks: buildAsks(openBeads) };
		} catch (error) {
			return { state: "unavailable", reason: reasonOf(error) };
		}
	}
}
