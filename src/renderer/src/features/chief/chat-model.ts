import { CHIEF_HISTORY_LIMIT, type ChiefMessage, type ChiefPresence } from "@shared/chief";

/**
 * Merge one pushed message into the chat: an update to a known id (queued →
 * sent) replaces it in place, anything else is appended. Kept in `at` order
 * (stable, so same-millisecond messages keep arrival order) and capped to the
 * newest CHIEF_HISTORY_LIMIT.
 */
export function upsertMessage(
	messages: readonly ChiefMessage[],
	message: ChiefMessage,
): readonly ChiefMessage[] {
	const index = messages.findIndex((existing) => existing.id === message.id);
	const merged =
		index === -1
			? [...messages, message]
			: messages.map((existing, i) => (i === index ? message : existing));
	const sorted = merged.toSorted((a, b) => a.at - b.at);
	return sorted.length > CHIEF_HISTORY_LIMIT ? sorted.slice(-CHIEF_HISTORY_LIMIT) : sorted;
}

/** The small-caps presence shown after `CHIEF OF STAFF ·`. */
export function presenceLabel(presence: ChiefPresence): string {
	switch (presence) {
		case "idle":
		case "done":
			return "ONLINE";
		case "working":
			return "WORKING";
		case "blocked":
			return "NEEDS YOU";
		default:
			return "OFFLINE";
	}
}

/** True while the chief is busy, so the chat shows "Max is working…". */
export function isWorking(presence: ChiefPresence): boolean {
	return presence === "working";
}

/** `max` → `Max`: roster names are lowercase handles. */
export function displayName(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}
