import { createLogger } from "@shared/log/logger";
import type {
	WorkBoard,
	WorkBoardApi,
	WorkCard,
	WorkLane,
	WorkPriority,
	WorkResult,
} from "@shared/work-board";
import { useMemo } from "react";
import { create } from "zustand";
import { applyEdit, editChanges, type WorkEdit } from "./work-model";

const log = createLogger("work");

const OPEN_KEY = "herdr-office.work.open";
/** The error slot for the '+ Add ticket' row (never a bead id). */
export const ADD_ERROR = "+add";

/** A write in flight (or confirmed but not yet in a board from main). */
export interface Pending<T> {
	readonly seq: number;
	readonly value: T;
	/** bd accepted it; dropped once the next board arrives, which includes it. */
	readonly settled: boolean;
}

interface WorkState {
	/** The board as main last sent it; null until the first one arrives. */
	readonly board: WorkBoard | null;
	readonly edits: readonly Pending<WorkEdit>[];
	/** Titles being created, shown at the top of Ready until the board has them. */
	readonly creating: readonly Pending<string>[];
	/** Inline errors from failed writes, by card id (or `ADD_ERROR`). */
	readonly errors: Readonly<Record<string, string>>;
	/** Whether the bar is open (else just its summary pill); remembered across restarts. */
	readonly open: boolean;
	/** Collapsed lanes (Done starts collapsed); kept while the bar is a pill, not across restarts. */
	readonly collapsed: Readonly<Record<WorkLane, boolean>>;
	receive(board: WorkBoard): void;
	setOpen(open: boolean): void;
	toggleLane(lane: WorkLane): void;
	dismissError(key: string): void;
}

function withoutKey(errors: Readonly<Record<string, string>>, key: string) {
	if (!(key in errors)) return errors;
	const { [key]: _gone, ...rest } = errors;
	return rest;
}

export const useWork = create<WorkState>((set) => ({
	board: null,
	edits: [],
	creating: [],
	errors: {},
	open: globalThis.localStorage?.getItem(OPEN_KEY) !== "closed",
	collapsed: { in_progress: false, blocked: false, ready: false, done: true },
	receive: (board) =>
		set((state) => ({
			board,
			edits: state.edits.filter((pending) => !pending.settled),
			creating: state.creating.filter((pending) => !pending.settled),
		})),
	setOpen: (open) => {
		globalThis.localStorage?.setItem(OPEN_KEY, open ? "open" : "closed");
		set({ open });
	},
	toggleLane: (lane) =>
		set((state) => ({ collapsed: { ...state.collapsed, [lane]: !state.collapsed[lane] } })),
	dismissError: (key) => set((state) => ({ errors: withoutKey(state.errors, key) })),
}));

/** The cards as shown: main's board with the writes bd hasn't reflected yet. Undefined unless the board is ok. */
export function shownCards(
	board: WorkBoard | null,
	edits: readonly Pending<WorkEdit>[],
): readonly WorkCard[] | undefined {
	if (board?.state !== "ok") return undefined;
	return edits.reduce((cards, pending) => applyEdit(cards, pending.value), board.cards);
}

export function useWorkCards(): readonly WorkCard[] | undefined {
	const board = useWork((state) => state.board);
	const edits = useWork((state) => state.edits);
	return useMemo(() => shownCards(board, edits), [board, edits]);
}

function workApi(): WorkBoardApi | null {
	return "work" in window.office ? window.office.work : null;
}

/** A write's outcome; a rejected call (IPC, validation) is a failure like any other. */
async function outcome(write: Promise<WorkResult>): Promise<WorkResult> {
	try {
		return await write;
	} catch (error) {
		return { ok: false, reason: error instanceof Error ? error.message : String(error) };
	}
}

let seq = 0;

/** Settle the pending write `mine` in `list`: kept (settled) on success, dropped on failure. */
function resolvePending<T>(list: readonly Pending<T>[], mine: number, ok: boolean) {
	return ok
		? list.map((pending) => (pending.seq === mine ? { ...pending, settled: true } : pending))
		: list.filter((pending) => pending.seq !== mine);
}

const failure: Readonly<Record<WorkEdit["kind"], string>> = {
	move: "Couldn't move it",
	priority: "Couldn't change the priority",
	assign: "Couldn't assign it",
};

async function runEdit(edit: WorkEdit, write: (api: WorkBoardApi) => Promise<WorkResult>) {
	const api = workApi();
	const { board, edits } = useWork.getState();
	const card = shownCards(board, edits)?.find((candidate) => candidate.id === edit.id);
	if (!api || !card || !editChanges(card, edit)) return;
	seq += 1;
	const mine = seq;
	useWork.setState((state) => ({
		edits: [...state.edits, { seq: mine, value: edit, settled: false }],
		errors: withoutKey(state.errors, edit.id),
	}));
	const result = await outcome(write(api));
	if (!result.ok)
		log.warn("work board write failed", { kind: edit.kind, id: edit.id, reason: result.reason });
	useWork.setState((state) => ({
		edits: resolvePending(state.edits, mine, result.ok),
		errors: result.ok
			? state.errors
			: { ...state.errors, [edit.id]: `${failure[edit.kind]}: ${result.reason}` },
	}));
}

const now = (): string => new Date().toISOString();

export function moveCard(id: string, lane: WorkLane): Promise<void> {
	return runEdit({ kind: "move", id, lane, at: now() }, (api) => api.move(id, lane));
}

export function setCardPriority(id: string, priority: WorkPriority): Promise<void> {
	return runEdit({ kind: "priority", id, priority, at: now() }, (api) =>
		api.setPriority(id, priority),
	);
}

export function assignCard(id: string, assignee: string | null): Promise<void> {
	return runEdit({ kind: "assign", id, assignee, at: now() }, (api) => api.assign(id, assignee));
}

/** Create a P2 open task; its title shows at the top of Ready until the board has the real card. */
export async function createCard(title: string): Promise<void> {
	const api = workApi();
	if (!api) return;
	seq += 1;
	const mine = seq;
	useWork.setState((state) => ({
		creating: [...state.creating, { seq: mine, value: title, settled: false }],
		errors: withoutKey(state.errors, ADD_ERROR),
	}));
	const result = await outcome(api.create(title));
	if (!result.ok) log.warn("work board create failed", { reason: result.reason });
	useWork.setState((state) => ({
		creating: resolvePending(state.creating, mine, result.ok),
		errors: result.ok
			? state.errors
			: { ...state.errors, [ADD_ERROR]: `Couldn't add “${title}”: ${result.reason}` },
	}));
}

/** Follow main's board (once per window); returns the cleanup. */
export function connectWork(): () => void {
	const api = workApi();
	const { receive } = useWork.getState();
	if (!api) {
		receive({ state: "unavailable", reason: "This build has no work board." });
		return () => undefined;
	}
	// A push that beats the first read is fresher; the read must not overwrite it.
	let pushed = false;
	let live = true;
	const off = api.onChanged((board) => {
		pushed = true;
		receive(board);
	});
	api.get().then(
		(board) => {
			if (live && !pushed) receive(board);
		},
		(error: unknown) => {
			log.warn("work board read failed", error instanceof Error ? error : { error: String(error) });
			if (live && !pushed) receive({ state: "unavailable", reason: "Couldn't read the board." });
		},
	);
	return () => {
		live = false;
		off();
	};
}
