export const MUTE_CHORD_LABEL = "Ctrl+Shift+Space";

export function isMuteChord(
	event: Pick<KeyboardEvent, "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "code">,
): boolean {
	return (
		event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "Space"
	);
}
