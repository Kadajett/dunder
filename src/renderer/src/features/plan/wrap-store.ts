import { createLogger } from "@shared/log/logger";
import type { DayWrap } from "@shared/wrap";
import { create } from "zustand";

const log = createLogger("wrap");

interface WrapStoreState {
	readonly wrap: DayWrap | null;
}

export const useWrap = create<WrapStoreState>(() => ({ wrap: null }));

const api = () => ("wrap" in window.office ? window.office.wrap : null);

/** The 'Day's end' notice is due: Max wrote today's wrap-up and Jeremy hasn't closed it. */
export const wrapDue = (wrap: DayWrap | null): wrap is DayWrap => wrap !== null && !wrap.dismissed;

/** Follow today's wrap-up; returns the cleanup. A main process without it just shows nothing. */
export function connectWrap(): () => void {
	const wrap = api();
	if (!wrap) return () => undefined;
	void wrap
		.today()
		.then((today) => useWrap.setState({ wrap: today }))
		.catch((error: unknown) => log.warn("no wrap-up today", { error }));
	return wrap.onChanged((today) => useWrap.setState({ wrap: today }));
}

/** Close the notice: hidden at once, kept closed by main. */
export function dismissWrap(): void {
	const wrap = api();
	const current = useWrap.getState().wrap;
	if (!wrap || !current) return;
	useWrap.setState({ wrap: { ...current, dismissed: true } });
	void wrap.dismiss().catch((error: unknown) => log.warn("cannot close the wrap-up", { error }));
}
