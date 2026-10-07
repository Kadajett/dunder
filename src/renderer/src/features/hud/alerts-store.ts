import { alertItemKey } from "@shared/alerts";
import { createLogger } from "@shared/log/logger";
import { create } from "zustand";
import { chime } from "../audio/chime";
import { useHud } from "./view-store";

const log = createLogger("alerts");

interface AlertsState {
	/** Null until main answers (or in a build without alerts). */
	readonly muted: boolean | null;
}

export const useAlerts = create<AlertsState>(() => ({ muted: null }));

const api = () => ("alerts" in window.office ? window.office.alerts : null);

/** Follow main's needs-you alerts: chime on a new batch, open the inbox on a clicked one. Returns the cleanup. */
export function connectAlerts(): () => void {
	const alerts = api();
	if (!alerts) return () => undefined;
	void alerts
		.muted()
		.then((muted) => useAlerts.setState({ muted }))
		.catch((error: unknown) => log.warn("alerts setting unreadable", { error }));
	const offs = [
		alerts.onChime(chime),
		alerts.onOpen((target) => useHud.getState().openInboxOn(alertItemKey(target))),
	];
	return () => {
		for (const off of offs) off();
	};
}

/** The bell in the Trust Inbox header: alerts on or off, saved in main. */
export function setAlertsMuted(muted: boolean): void {
	const alerts = api();
	if (!alerts) return;
	const before = useAlerts.getState().muted;
	useAlerts.setState({ muted });
	alerts.setMuted(muted).catch((error: unknown) => {
		log.warn("alerts setting not saved", { error });
		useAlerts.setState({ muted: before });
	});
}
