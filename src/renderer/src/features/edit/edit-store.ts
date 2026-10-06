import type { ItemRef } from "@shared/layout/ops";
import type { Layout } from "@shared/layout/schema";
import { useEffect } from "react";
import { create } from "zustand";
import { useFocus } from "../office/focus/focus-store";

const UNDO_LIMIT = 100;

export interface EditStatus {
	readonly tone: "info" | "error";
	readonly text: string;
}

export interface EditState {
	readonly editing: boolean;
	/** The saved layout edit mode starts from (the current company's). */
	readonly base: Layout | null;
	/** The layout being edited; the office renders it while editing. */
	readonly draft: Layout | null;
	readonly selected: ItemRef | null;
	readonly past: readonly Layout[];
	readonly future: readonly Layout[];
	/** Consecutive `apply`s with the same key (typing in one field) share one undo step. */
	readonly mergeKey: string | null;
	readonly saving: boolean;
	readonly status: EditStatus | null;
	/** Just saved: keep showing the draft until the saved layout comes back as `base`. */
	readonly holding: boolean;
	setBase(layout: Layout): void;
	enter(): void;
	/** Leave edit mode, discarding the draft. */
	cancel(): void;
	/** Leave edit mode after the draft was saved. */
	saved(): void;
	select(ref: ItemRef | null): void;
	/** Replace the draft as one undoable step. */
	apply(next: Layout, mergeKey?: string): void;
	/** Start a gesture (a drag): one undo step for everything `preview`ed until the next one. */
	checkpoint(): void;
	/** Replace the draft without an undo step. */
	preview(next: Layout): void;
	undo(): void;
	redo(): void;
	setSaving(saving: boolean): void;
	setStatus(status: EditStatus | null): void;
}

const pushed = (past: readonly Layout[], draft: Layout) => [...past, draft].slice(-UNDO_LIMIT);

export const useEdit = create<EditState>((set, get) => ({
	editing: false,
	base: null,
	draft: null,
	selected: null,
	past: [],
	future: [],
	mergeKey: null,
	saving: false,
	status: null,
	holding: false,
	setBase: (base) => set({ base, holding: false }),
	enter: () => {
		const { base, draft, editing, holding } = get();
		const start = holding && draft ? draft : base;
		if (!start || editing) return;
		useFocus.getState().leave();
		set({ editing: true, draft: start, selected: null, past: [], future: [], mergeKey: null });
		set({ status: null, saving: false, holding: false });
	},
	cancel: () =>
		set({ editing: false, draft: null, selected: null, past: [], future: [], status: null }),
	saved: () =>
		set({ editing: false, holding: true, selected: null, past: [], future: [], status: null }),
	select: (selected) => set({ selected, mergeKey: null }),
	apply: (next, mergeKey) => {
		const { draft, past } = get();
		if (!draft || next === draft) return;
		if (mergeKey !== undefined && mergeKey === get().mergeKey) {
			set({ draft: next });
			return;
		}
		set({ draft: next, past: pushed(past, draft), future: [], mergeKey: mergeKey ?? null });
	},
	checkpoint: () => {
		const { draft, past } = get();
		if (draft) set({ past: pushed(past, draft), future: [], mergeKey: null });
	},
	preview: (next) => {
		if (get().draft) set({ draft: next });
	},
	undo: () => {
		const { draft, past, future } = get();
		const previous = past.at(-1);
		if (!draft || !previous) return;
		set({ draft: previous, past: past.slice(0, -1), future: [draft, ...future], mergeKey: null });
	},
	redo: () => {
		const { draft, past, future } = get();
		const [next, ...rest] = future;
		if (!draft || !next) return;
		set({ draft: next, past: pushed(past, draft), future: rest, mergeKey: null });
	},
	setSaving: (saving) => set({ saving }),
	setStatus: (status) => set({ status }),
}));

/**
 * The layout the office should show: the edit draft while editing (and just
 * after saving, until `layout` catches up), otherwise `layout` itself.
 */
export function useEditedLayout(layout: Layout): Layout {
	useEffect(() => useEdit.getState().setBase(layout), [layout]);
	const draft = useEdit((state) => (state.editing || state.holding ? state.draft : null));
	return draft ?? layout;
}
