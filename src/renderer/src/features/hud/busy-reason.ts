export interface BusyInputs {
	/** Dunder's window has focus. */
	readonly focused: boolean;
	/** What the camera is focused on: a terminal, the pool table, or nothing. */
	readonly focus: "screen" | "table" | null;
	readonly whiteboard: boolean;
	readonly hiring: boolean;
	readonly typing: boolean;
}

/**
 * Why an agent's update should wait, or null when Jeremy is free: only while
 * Dunder is the window he is using. A call never holds an update: it picks
 * up again after the relaunch (office-ey5).
 */
export function busyReason(inputs: BusyInputs): string | null {
	if (!inputs.focused) return null;
	if (inputs.focus === "screen") return "in a terminal";
	if (inputs.focus === "table") return "at the pool table";
	if (inputs.whiteboard) return "on the whiteboard";
	if (inputs.hiring) return "hiring";
	return inputs.typing ? "typing" : null;
}
