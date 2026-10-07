import { create } from "zustand";

/** Per machine, like the chosen mic: this window's localStorage. */
const SOUNDS_KEY = "dunder.sounds";

function loadSoundsOn(): boolean {
	return globalThis.localStorage?.getItem(SOUNDS_KEY) !== "off";
}

interface SoundsState {
	/**
	 * The master switch over every app sound (the chime, Max's voice on a
	 * call). Off, nothing plays; each feature's own mute still works under it.
	 */
	readonly on: boolean;
}

export const useSounds = create<SoundsState>(() => ({ on: loadSoundsOn() }));

export function setSoundsOn(on: boolean): void {
	globalThis.localStorage?.setItem(SOUNDS_KEY, on ? "on" : "off");
	useSounds.setState({ on });
}

export const soundsOn = (): boolean => useSounds.getState().on;
