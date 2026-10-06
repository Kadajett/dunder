import { create } from "zustand";

interface WhiteboardState {
	/** Whether the whiteboard editor overlay is open. */
	readonly open: boolean;
	setOpen(open: boolean): void;
}

/** The whiteboard overlay's open state: the HUD menu (and the board in the room) open it. */
export const useWhiteboard = create<WhiteboardState>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
}));
