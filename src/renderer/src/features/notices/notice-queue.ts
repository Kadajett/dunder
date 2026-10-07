/** The notices that share the slot under the top bar. */
export type NoticeId = "plan" | "day-end" | "away" | "whats-new" | "since-you-left";

export const NOTICE_LABELS: Readonly<Record<NoticeId, string>> = {
	plan: "Today's plan",
	"day-end": "Day's end",
	away: "While you were away",
	"whats-new": "What's new",
	"since-you-left": "Since you left",
};

/**
 * The due notices in priority order: the morning plan, then Max's evening
 * wrap-up, then what happened while away, then what's new. Away and what's
 * new due together are one 'Since you left' notice.
 */
export function noticeQueue(due: {
	readonly plan: boolean;
	readonly dayEnd: boolean;
	readonly away: boolean;
	readonly whatsNew: boolean;
}): NoticeId[] {
	const queue: NoticeId[] = [];
	if (due.plan) queue.push("plan");
	if (due.dayEnd) queue.push("day-end");
	if (due.away && due.whatsNew) queue.push("since-you-left");
	else if (due.away) queue.push("away");
	else if (due.whatsNew) queue.push("whats-new");
	return queue;
}

/** The notice shown: the one Jeremy paged to while it is still due, else the first. */
export function shownNotice(queue: readonly NoticeId[], picked: NoticeId | null): NoticeId | null {
	return picked !== null && queue.includes(picked) ? picked : (queue[0] ?? null);
}

/** The one after `current` in the queue, wrapping round. */
export function nextNotice(queue: readonly NoticeId[], current: NoticeId): NoticeId {
	return queue[(queue.indexOf(current) + 1) % queue.length] ?? current;
}
