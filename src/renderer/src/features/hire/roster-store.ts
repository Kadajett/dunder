import { type AvatarStyle, avatarStyleFor } from "@shared/avatar/style";
import type { Roster } from "@shared/company/roster";
import { useMemo } from "react";
import { create } from "zustand";

interface RosterState {
	readonly roster: Roster | null;
	set(roster: Roster): void;
}

/** The workforce roster as main last pushed it, shared by every component. */
export const useRosterStore = create<RosterState>((set) => ({
	roster: null,
	set: (roster) => set({ roster }),
}));

/**
 * Connect the store to main (once per window). Tolerates a preload without
 * the roster API, so a renderer hot-reload ahead of a main restart still works.
 */
export function connectRoster(): () => void {
	if (!("roster" in window.office)) return () => undefined;
	const { roster } = window.office;
	const { set } = useRosterStore.getState();
	void roster.get().then((value) => value && set(value));
	return roster.onChange(set);
}

/** An agent's look: the style it was hired with, else the one its name seeds. */
export function useAgentStyle(name: string): AvatarStyle {
	const hired = useRosterStore(
		(state) => state.roster?.agents.find((agent) => agent.name === name)?.style,
	);
	return useMemo(() => hired ?? avatarStyleFor(name), [hired, name]);
}
