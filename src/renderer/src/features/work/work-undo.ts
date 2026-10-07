import type { WorkCard, WorkLane } from "@shared/work-board";
import { create } from "zustand";
import { laneLabels, shortId, type WorkEdit } from "./work-model";

/** How long the toast offers Undo. */
export const UNDO_MS = 6_000;

/** The write that puts a card back how it was before an edit (through the same WorkBoardApi calls). */
export type WorkUndo =
	| { readonly kind: "move"; readonly id: string; readonly lane: WorkLane }
	| { readonly kind: "priority"; readonly id: string; readonly priority: WorkCard["priority"] }
	| { readonly kind: "assign"; readonly id: string; readonly assignee: string | null };

/**
 * The lane to move back to. A card in Blocked only because of its blockers
 * (bd status open) goes back to Ready: its blockers put it in Blocked again,
 * where moving it to Blocked would set status=blocked.
 */
function laneBack(card: WorkCard): WorkLane {
	return card.lane === "blocked" && card.waitingOn.length > 0 ? "ready" : card.lane;
}

/** Undo for `edit`, from the card as it was just before it. */
export function undoOf(before: WorkCard, edit: WorkEdit): WorkUndo {
	switch (edit.kind) {
		case "move":
			return { kind: "move", id: edit.id, lane: laneBack(before) };
		case "priority":
			return { kind: "priority", id: edit.id, priority: before.priority };
		case "assign":
			return { kind: "assign", id: edit.id, assignee: before.assignee };
	}
}

const who = (assignee: string | null): string => assignee ?? "unassigned";

/** 'Moved 67k to Done', 'P1 → P3 on 67k', 'theo → carl on 67k'. */
export function editLabel(before: WorkCard, edit: WorkEdit): string {
	const id = shortId(edit.id);
	switch (edit.kind) {
		case "move":
			return `Moved ${id} to ${laneLabels[edit.lane]}`;
		case "priority":
			return `P${before.priority} → P${edit.priority} on ${id}`;
		case "assign":
			return `${who(before.assignee)} → ${who(edit.assignee)} on ${id}`;
	}
}

export type UndoToast =
	| { readonly state: "offered"; readonly label: string; readonly undo: WorkUndo }
	| { readonly state: "undoing"; readonly label: string; readonly undo: WorkUndo }
	| { readonly state: "failed"; readonly label: string; readonly reason: string }
	/** A new ticket: bd can't delete, so the toast says how to take it back instead. */
	| { readonly state: "added"; readonly label: string };

export type ShownToast = UndoToast & { readonly seq: number };

interface UndoState {
	/** The latest of Jeremy's board writes (one level); null once it times out. */
	readonly toast: ShownToast | null;
}

export const useWorkUndo = create<UndoState>(() => ({ toast: null }));

let toastSeq = 0;

/** Show a toast, replacing any other; returns its number (a later one wins). */
export function showToast(toast: UndoToast): number {
	toastSeq += 1;
	useWorkUndo.setState({ toast: { ...toast, seq: toastSeq } });
	return toastSeq;
}

/** Drop toast `seq` (if it is still the one shown). */
export function dropToast(seq: number): void {
	if (useWorkUndo.getState().toast?.seq === seq) useWorkUndo.setState({ toast: null });
}
