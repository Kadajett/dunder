import { create } from "zustand";

/** Office = the 3D room; classic = a flat grid of the same agents and terminals. */
export type ViewMode = "office" | "classic";

/** Side panels opened from the top bar. */
export type HudPanel = "inbox" | "team" | "brain" | "clients";

interface HudState {
	readonly view: ViewMode;
	readonly panel: HudPanel | null;
	/** The Trust Inbox item to scroll to and flash (from a clicked notification). */
	readonly focusItem: string | null;
	setView(view: ViewMode): void;
	/** Toggle a panel: opening the open one closes it. */
	togglePanel(panel: HudPanel): void;
	closePanel(): void;
	/** Open the Trust Inbox on the item with this key. */
	openInboxOn(itemKey: string): void;
}

const VIEW_KEY = "herdr-office.view";

function storedView(): ViewMode {
	return globalThis.localStorage?.getItem(VIEW_KEY) === "classic" ? "classic" : "office";
}

export const useHud = create<HudState>((set) => ({
	view: storedView(),
	panel: null,
	focusItem: null,
	setView: (view) => {
		globalThis.localStorage?.setItem(VIEW_KEY, view);
		set({ view });
	},
	togglePanel: (panel) => set((state) => ({ panel: state.panel === panel ? null : panel })),
	closePanel: () => set({ panel: null, focusItem: null }),
	openInboxOn: (itemKey) => set({ panel: "inbox", focusItem: itemKey }),
}));
