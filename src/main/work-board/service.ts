import { createLogger } from "@shared/log/logger";
import {
	type HumanAsk,
	REVIEW_LABEL,
	type ShippingStats,
	type WorkBoard,
	type WorkCard,
	type WorkLane,
	type WorkPriority,
	type WorkResult,
} from "@shared/work-board";
import { z } from "zod";
import type { BdRunner } from "../beads/bd";
import { buildAsks } from "./asks";
import { type Bead, buildCards, closedIds, isEpic, isHumanAsk, parseBeads } from "./cards";
import { type SpendOf, withSpend } from "./spend";

const log = createLogger("work-board");

/** How often bd is re-read; agents and the CLI change beads behind the app's back. */
export const WORK_POLL_MS = 5_000;
/** The Done lane looks back this far. */
const DONE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Closed beads this recent still count towards their epic's spend. */
const EPIC_WINDOW_MS = 30 * DONE_WINDOW_MS;

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
	/** An agent's AI spend over a time span, for each card's approximate cost. */
	readonly spendOf: SpendOf;
	/** Adds what the board knows beyond bd: Review cards' merge check and entry time (left out in tests). */
	readonly annotate?: (cards: readonly WorkCard[]) => Promise<readonly WorkCard[]>;
	/** The SHIPPING figures from the beads closed lately and the cards (left out in tests). */
	readonly shipping?: (
		closed: readonly Bead[],
		cards: readonly WorkCard[],
		now: number,
	) => Promise<ShippingStats>;
}

/** A board as read from bd, before main stamps its revision. */
type BoardContent =
	| Omit<Extract<WorkBoard, { state: "ok" }>, "revision">
	| Extract<WorkBoard, { state: "unavailable" }>;

const showSchema = z
	.array(z.object({ status: z.string(), labels: z.array(z.string()).nullish() }))
	.min(1);
const detailsSchema = z.array(
	z.object({
		id: z.string(),
		title: z.string(),
		notes: z.string().optional(),
		issue_type: z.string().optional(),
	}),
);
export type BeadNotes = z.infer<typeof detailsSchema>[number];

/** Where a bead is now, for planning a move. */
export interface BeadPlace {
	readonly status: string;
	/** Carries the `review` label (waiting for Max). */
	readonly inReview: boolean;
}

/**
 * The bd commands that put a bead into `lane`, in order. Review is
 * in_progress plus the `review` label; leaving it drops the label (except
 * to Done: closed beads leave every lane, label or not).
 */
export function movePlan(id: string, from: BeadPlace, lane: WorkLane): string[][] {
	const closed = from.status === "closed";
	if (lane === "done") return closed ? [] : [["close", id]];
	const reopen = closed ? [["reopen", id]] : [];
	if (lane === "review")
		return [...reopen, ["update", id, "--status=in_progress", `--add-label=${REVIEW_LABEL}`]];
	const unlabel = from.inReview ? [`--remove-label=${REVIEW_LABEL}`] : [];
	if (lane === "ready" && closed)
		return unlabel.length > 0 ? [...reopen, ["update", id, ...unlabel]] : reopen;
	const status = lane === "ready" ? "open" : lane;
	return [...reopen, ["update", id, `--status=${status}`, ...unlabel]];
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
	/** Beads closed in the last 30 days, as last read (newest close first is not guaranteed). */
	#closed: readonly Bead[] = [];
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

	/** Beads (not epics or asks) closed after `since` (epoch ms), newest first, from the last read. */
	async closedSince(
		since: number,
	): Promise<readonly { readonly id: string; readonly title: string }[]> {
		await this.get();
		const closedAt = (bead: Bead) => Date.parse(bead.closed_at ?? "") || 0;
		return this.#closed
			.filter((bead) => !isEpic(bead) && !isHumanAsk(bead) && closedAt(bead) > since)
			.sort((a, b) => closedAt(b) - closedAt(a))
			.map(({ id, title }) => ({ id, title }));
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
			const from = {
				status: bead?.status ?? "",
				inReview: (bead?.labels ?? []).includes(REVIEW_LABEL),
			};
			return await this.#write(movePlan(id, from, lane));
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

	/** Title and notes of each bead bd knows (unknown ids are left out); throws when bd fails. */
	async details(ids: readonly string[]): Promise<readonly BeadNotes[]> {
		if (ids.length === 0) return [];
		try {
			return detailsSchema.parse(JSON.parse(await this.#bd(["show", ...ids, "--json"])));
		} catch (error) {
			// bd exits 1 when it knows none of the ids; that is an empty answer, not a failure.
			if (/no issues? found matching/i.test(reasonOf(error))) return [];
			throw error;
		}
	}

	/** A comment on a bead, signed by `author` (bd records the comment, not the git user). */
	comment(id: string, text: string, author: string): Promise<WorkResult> {
		return this.#write([["comments", "add", id, "-a", author, "--", text]]);
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
			const now = this.#deps.now();
			const since = new Date(now - EPIC_WINDOW_MS).toISOString();
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
			const closedBeads = parseBeads(closed);
			this.#closed = closedBeads;
			const lists = {
				open: openBeads,
				blocked: parseBeads(blocked),
				ready: parseBeads(ready),
				closed: closedBeads,
			};
			const cards = buildCards(lists, now - DONE_WINDOW_MS);
			const priced = withSpend(cards, [...openBeads, ...closedBeads], this.#deps.spendOf, now);
			const checked = (await this.#deps.annotate?.(priced)) ?? priced;
			const closedToday = closedIds(closedBeads, now - DONE_WINDOW_MS);
			const shipping = await this.#deps.shipping?.(closedBeads, checked, now);
			const asks = buildAsks(openBeads);
			return { state: "ok", cards: checked, asks, closedToday, ...(shipping && { shipping }) };
		} catch (error) {
			return { state: "unavailable", reason: reasonOf(error) };
		}
	}
}
