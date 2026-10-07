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
import { dropToast, editLabel, showToast, undoOf, useWorkUndo, type WorkUndo } from "./work-undo";

const log = createLogger("work");

const OPEN_KEY = "herdr-office.work.open";
/** The error slot for the '+ Add ticket' row (never a bead id). */
export const ADD_ERROR = "+add";

/** A write in flight (or confirmed but not yet in a board from main). */
export interface Pending<T> {
	readonly seq: number;
	readonly value: T;
	/** null while bd runs it; then the first board revision that includes it (it drops once that board is here). */
	readonly revision: number | null;
}

/** Whether `board` already shows the confirmed write `pending` (so the overlay can go). */
const shownBy = (board: WorkBoard | null, pending: Pending<unknown>): boolean =>
	pending.revision !== null && board?.state === "ok" && board.revision >= pending.revision;

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
	/** The card opened in place (one at a time), if any. */
	readonly expanded: string | null;
	/** Asks Jeremy just answered or dismissed: hidden until bd confirms (or back with an error). */
	readonly answering: readonly string[];
	/** Show only this agent's beads (a clicked assignee chip); not kept across restarts. */
	readonly agentFilter: string | null;
	receive(board: WorkBoard): void;
	setOpen(open: boolean): void;
	toggleLane(lane: WorkLane): void;
	dismissError(key: string): void;
	expand(id: string | null): void;
	/** Open the bar on `id`: the bar open, its lane unfolded, the card expanded (out of a filter that hides it). */
	reveal(id: string): void;
	/** Filter to `agent`, or clear the filter with null. */
	filterAgent(agent: string | null): void;
	/** Open the bar on one agent's beads (from its Team card). */
	showAgent(agent: string): void;
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
	agentFilter: null,
	collapsed: { in_progress: false, review: false, blocked: false, ready: false, done: true },
	expanded: null,
	answering: [],
	receive: (board) =>
		set((state) => ({
			board,
			edits: state.edits.filter((pending) => !shownBy(board, pending)),
			creating: state.creating.filter((pending) => !shownBy(board, pending)),
			// Answered asks drop out of the board; forget them once they have.
			answering:
				board.state === "ok"
					? state.answering.filter((id) => board.asks.some((ask) => ask.id === id))
					: state.answering,
		})),
	setOpen: (open) => {
		globalThis.localStorage?.setItem(OPEN_KEY, open ? "open" : "closed");
		set({ open });
	},
	toggleLane: (lane) =>
		set((state) => ({ collapsed: { ...state.collapsed, [lane]: !state.collapsed[lane] } })),
	dismissError: (key) => set((state) => ({ errors: withoutKey(state.errors, key) })),
	expand: (expanded) => set({ expanded }),
	reveal: (id) =>
		set((state) => {
			globalThis.localStorage?.setItem(OPEN_KEY, "open");
			const card =
				state.board?.state === "ok" ? state.board.cards.find((each) => each.id === id) : undefined;
			const collapsed = card ? { ...state.collapsed, [card.lane]: false } : state.collapsed;
			const agentFilter = card && card.assignee === state.agentFilter ? state.agentFilter : null;
			return { open: true, expanded: id, collapsed, agentFilter };
		}),
	filterAgent: (agentFilter) => set({ agentFilter }),
	showAgent: (agent) => {
		globalThis.localStorage?.setItem(OPEN_KEY, "open");
		set({ open: true, agentFilter: agent });
	},
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

export function workApi(): WorkBoardApi | null {
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

/**
 * Settle the pending write `mine` in `list`: gone on failure, and gone on
 * success once `board` has the write. Main sends that board before the result,
 * so it is usually here already; otherwise `receive` drops it when it comes.
 */
function resolvePending<T>(
	list: readonly Pending<T>[],
	mine: number,
	result: WorkResult,
	board: WorkBoard | null,
): readonly Pending<T>[] {
	if (!result.ok) return list.filter((pending) => pending.seq !== mine);
	const confirmed = list.map((pending) =>
		pending.seq === mine ? { ...pending, revision: result.revision } : pending,
	);
	return confirmed.filter((pending) => !shownBy(board, pending));
}

const failure: Readonly<Record<WorkEdit["kind"], string>> = {
	move: "Couldn't move it",
	priority: "Couldn't change the priority",
	assign: "Couldn't assign it",
};

/** Run Jeremy's edit; the card as it was before, with bd's result (null when nothing ran). */
async function runEdit(
	edit: WorkEdit,
	write: (api: WorkBoardApi) => Promise<WorkResult>,
): Promise<{ readonly before: WorkCard; readonly result: WorkResult } | null> {
	const api = workApi();
	const { board, edits } = useWork.getState();
	const card = shownCards(board, edits)?.find((candidate) => candidate.id === edit.id);
	if (!api || !card || !editChanges(card, edit)) return null;
	seq += 1;
	const mine = seq;
	useWork.setState((state) => ({
		edits: [...state.edits, { seq: mine, value: edit, revision: null }],
		errors: withoutKey(state.errors, edit.id),
	}));
	const result = await outcome(write(api));
	if (!result.ok)
		log.warn("work board write failed", { kind: edit.kind, id: edit.id, reason: result.reason });
	useWork.setState((state) => ({
		edits: resolvePending(state.edits, mine, result, state.board),
		errors: result.ok
			? state.errors
			: { ...state.errors, [edit.id]: `${failure[edit.kind]}: ${result.reason}` },
	}));
	return { before: card, result };
}

/** An edit Jeremy made from the bar: once bd has it, the toast offers to undo it. */
async function editWithUndo(edit: WorkEdit, write: (api: WorkBoardApi) => Promise<WorkResult>) {
	const done = await runEdit(edit, write);
	if (!done?.result.ok) return;
	showToast({
		state: "offered",
		label: editLabel(done.before, edit),
		undo: undoOf(done.before, edit),
	});
}

const now = (): string => new Date().toISOString();

const moveEdit = (id: string, lane: WorkLane): WorkEdit => ({ kind: "move", id, lane, at: now() });
const priorityEdit = (id: string, priority: WorkPriority): WorkEdit => ({
	kind: "priority",
	id,
	priority,
	at: now(),
});
const assignEdit = (id: string, assignee: string | null): WorkEdit => ({
	kind: "assign",
	id,
	assignee,
	at: now(),
});

export function moveCard(id: string, lane: WorkLane): Promise<void> {
	return editWithUndo(moveEdit(id, lane), (api) => api.move(id, lane));
}

export function setCardPriority(id: string, priority: WorkPriority): Promise<void> {
	return editWithUndo(priorityEdit(id, priority), (api) => api.setPriority(id, priority));
}

export function assignCard(id: string, assignee: string | null): Promise<void> {
	return editWithUndo(assignEdit(id, assignee), (api) => api.assign(id, assignee));
}

function runUndo(undo: WorkUndo) {
	switch (undo.kind) {
		case "move":
			return runEdit(moveEdit(undo.id, undo.lane), (api) => api.move(undo.id, undo.lane));
		case "priority":
			return runEdit(priorityEdit(undo.id, undo.priority), (api) =>
				api.setPriority(undo.id, undo.priority),
			);
		case "assign":
			return runEdit(assignEdit(undo.id, undo.assignee), (api) =>
				api.assign(undo.id, undo.assignee),
			);
	}
}

/** The toast's Undo: the inverse through bd; the toast goes only once bd confirms, or says why it failed. */
export async function undoLast(): Promise<void> {
	const toast = useWorkUndo.getState().toast;
	if (toast?.state !== "offered") return;
	useWorkUndo.setState({ toast: { ...toast, state: "undoing" } });
	const done = await runUndo(toast.undo);
	if (!done || done.result.ok) {
		dropToast(toast.seq);
		return;
	}
	if (useWorkUndo.getState().toast?.seq !== toast.seq) return;
	showToast({ state: "failed", label: toast.label, reason: done.result.reason });
}

/** Create a P2 open task; its title shows at the top of Ready until the board has the real card. */
export async function createCard(title: string): Promise<void> {
	const api = workApi();
	if (!api) return;
	seq += 1;
	const mine = seq;
	useWork.setState((state) => ({
		creating: [...state.creating, { seq: mine, value: title, revision: null }],
		errors: withoutKey(state.errors, ADD_ERROR),
	}));
	const result = await outcome(api.create(title));
	if (!result.ok) log.warn("work board create failed", { reason: result.reason });
	useWork.setState((state) => ({
		creating: resolvePending(state.creating, mine, result, state.board),
		errors: result.ok
			? state.errors
			: { ...state.errors, [ADD_ERROR]: `Couldn't add “${title}”: ${result.reason}` },
	}));
	// bd can't delete, so there is no Undo: the toast says how to take it back.
	if (result.ok) showToast({ state: "added", label: `Added “${title}”` });
}
