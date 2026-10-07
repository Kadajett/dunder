import type { FocusTarget } from "./focus-store";

export const LEAVE_CHORD_LABEL = "Ctrl+Shift+O";

type Keys = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

export function isLeaveChord(event: Keys): boolean {
	return (
		event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyO"
	);
}

/**
 * Whether a key press leaves focus: the chord always does. Esc leaves the
 * pool table but never a screen, whose terminal programs need it.
 */
export function leavesFocus(kind: FocusTarget["kind"], event: Keys): boolean {
	if (isLeaveChord(event)) return true;
	return kind === "table" && event.key === "Escape";
}
