import { create } from "zustand";

/** What the user last clicked in the world (other than a monitor, which focuses). */
export type Selection =
	| { readonly kind: "agent"; readonly paneId: string }
	| { readonly kind: "decor"; readonly id: string };

interface SelectionState {
	readonly selection: Selection | null;
	select(selection: Selection): void;
	clear(): void;
}

export const useSelection = create<SelectionState>((set) => ({
	selection: null,
	select: (selection) => set({ selection }),
	clear: () => set({ selection: null }),
}));
