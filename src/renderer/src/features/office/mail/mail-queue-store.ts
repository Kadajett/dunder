import type { MailQueue } from "@shared/mail-queue";
import { create } from "zustand";

interface MailQueueState {
	/** Undelivered mail per agent name (see `@shared/mail-queue`). */
	readonly queue: MailQueue;
	set(queue: MailQueue): void;
}

export const useMailQueue = create<MailQueueState>((set) => ({
	queue: {},
	set: (queue) => set({ queue }),
}));

/**
 * Connect the store to main's mail queue (once per window). Tolerates a
 * preload that predates the API, so a renderer hot-reload ahead of a main
 * restart never blanks the office.
 */
export function connectMailQueue(): () => void {
	const api = "mailQueue" in window.office ? window.office.mailQueue : undefined;
	if (!api) return () => undefined;
	const { set } = useMailQueue.getState();
	void api.get().then(set);
	return api.onChange(set);
}
