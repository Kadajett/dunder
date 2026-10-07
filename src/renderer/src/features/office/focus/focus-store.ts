import { create } from "zustand";
import type { TablePlacement } from "../../pool/table-space";
import type { ScreenPlacement } from "../scene/station";

/** The computer the user clicked: whose screen to open, and where it sits. */
export interface ScreenFocus {
	readonly kind: "screen";
	readonly deskId: string;
	readonly paneId: string;
	readonly agentName: string;
	/** Agent TUIs enable bracketed paste; herdr frames do not report it. */
	readonly bracketedPaste: boolean;
	/** The monitor's screen in world space, for the camera to face. */
	readonly screen: ScreenPlacement;
}

/** The pool table, seen from above for Jeremy to play. */
export interface TableFocus {
	readonly kind: "table";
	readonly table: TablePlacement;
}

export type FocusTarget = ScreenFocus | TableFocus;

/** The focused thing's on-screen rectangle in CSS pixels, relative to the canvas (a table's cloth). */
export interface ScreenRect {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Focus lifecycle: `entering` while the camera tweens to the monitor or table,
 * `focused` once it is settled (the terminal or table view mounts), `leaving`
 * while it tweens back. `null` is the office overview.
 */
export type FocusPhase = "entering" | "focused" | "leaving";

interface FocusState {
	readonly target: FocusTarget | null;
	readonly phase: FocusPhase | null;
	readonly rect: ScreenRect | null;
	focus(target: FocusTarget): void;
	/** Leave focus (a screen never binds it to Esc: terminal programs need it; the table does). */
	leave(): void;
	settled(rect: ScreenRect): void;
	returned(): void;
}

export const useFocus = create<FocusState>((set, get) => ({
	target: null,
	phase: null,
	rect: null,
	focus: (target) => {
		if (get().phase !== null) return;
		set({ target, phase: "entering", rect: null });
	},
	leave: () => {
		const { phase } = get();
		if (phase === "entering" || phase === "focused") set({ phase: "leaving", rect: null });
	},
	settled: (rect) => {
		const { phase } = get();
		if (phase === "entering" || phase === "focused") set({ phase: "focused", rect });
	},
	returned: () => set({ target: null, phase: null, rect: null }),
}));
