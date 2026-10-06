import { create } from "zustand";

interface ChiefDockState {
	/** True while the chat panel is open above the pill. */
	readonly expanded: boolean;
	open(): void;
	close(): void;
	toggle(): void;
}

/** Whether the Chief of Staff dock is expanded; opened from the pill or your desk. */
export const useChief = create<ChiefDockState>((set) => ({
	expanded: false,
	open: () => set({ expanded: true }),
	close: () => set({ expanded: false }),
	toggle: () => set((state) => ({ expanded: !state.expanded })),
}));
