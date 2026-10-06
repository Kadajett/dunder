import { create } from "zustand";

interface HireState {
	/** Whether the hire dialog is showing. */
	readonly open: boolean;
	show(): void;
	close(): void;
}

/** Opened from the reception desk and the Team panel's Hire button. */
export const useHire = create<HireState>((set) => ({
	open: false,
	show: () => set({ open: true }),
	close: () => set({ open: false }),
}));
