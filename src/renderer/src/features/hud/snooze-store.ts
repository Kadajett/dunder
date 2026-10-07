import type { Snooze, SnoozeChoice } from "@shared/inbox-snooze";
import { createLogger } from "@shared/log/logger";
import { create } from "zustand";

const log = createLogger("trust-inbox");

/** Main's running Trust Inbox snoozes. */
export const useSnoozes = create<{ readonly snoozes: readonly Snooze[] }>(() => ({ snoozes: [] }));

const api = () => ("snoozes" in window.office ? window.office.snoozes : null);

/** Follow main's snoozes for the page's lifetime (a preload without them: none). */
export function connectSnoozes(): () => void {
	const snoozes = api();
	if (!snoozes) return () => undefined;
	let live = true;
	snoozes.list().then(
		(list) => {
			if (live) useSnoozes.setState({ snoozes: list });
		},
		(error: unknown) => log.warn("snoozes not loaded", { error }),
	);
	const off = snoozes.onChanged((list) => useSnoozes.setState({ snoozes: list }));
	return () => {
		live = false;
		off();
	};
}

export function snoozeItem(key: string, choice: SnoozeChoice): void {
	api()
		?.snooze(key, choice)
		.catch((error: unknown) => log.warn("snooze failed", { key, error }));
}

export function unsnoozeItem(key: string): void {
	api()
		?.unsnooze(key)
		.catch((error: unknown) => log.warn("unsnooze failed", { key, error }));
}
