export interface BusyInputs {
	readonly onCall: boolean;
	/** Dunder's window has focus. */
	readonly focused: boolean;
	/** What the camera is focused on: a terminal, the pool table, or nothing. */
	readonly focus: "screen" | "table" | null;
	readonly whiteboard: boolean;
	readonly hiring: boolean;
	readonly typing: boolean;
}

/**
 * Why an agent's update should wait, or null when Jeremy is free. A call
 * counts even with the window in the background; the rest only while
 * Dunder is the window he is using.
 */
export function busyReason(inputs: BusyInputs): string | null {
	if (inputs.onCall) return "on a call";
	if (!inputs.focused) return null;
	if (inputs.focus === "screen") return "in a terminal";
	if (inputs.focus === "table") return "at the pool table";
	if (inputs.whiteboard) return "on the whiteboard";
	if (inputs.hiring) return "hiring";
	return inputs.typing ? "typing" : null;
}
