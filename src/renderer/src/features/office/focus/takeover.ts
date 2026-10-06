import { useTv } from "../tv/tv-store";
import { useFocus } from "./focus-store";

/** A focused screen or the fullscreen TV owns the window: the left bar steps aside until it ends. */
export function useScreenTakeover(): boolean {
	const focused = useFocus((state) => state.target !== null);
	const tv = useTv((state) => state.fullscreen);
	return focused || tv;
}
