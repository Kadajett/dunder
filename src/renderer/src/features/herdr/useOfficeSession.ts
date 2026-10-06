import type { SessionSnapshot } from "@shared/herdr/schema";
import type { BridgeStatus } from "@shared/ipc";
import { useEffect, useState } from "react";

export interface OfficeSession {
	readonly snapshot: SessionSnapshot | null;
	readonly status: BridgeStatus;
}

/** Live view of the `office` herdr session, pushed from the main process. */
export function useOfficeSession(): OfficeSession {
	const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
	const [status, setStatus] = useState<BridgeStatus>({ state: "starting" });

	useEffect(() => {
		const office = window.office;
		const unsubscribers = [office.onSnapshot(setSnapshot), office.onStatus(setStatus)];
		void office.getSnapshot().then((initial) => {
			if (initial) setSnapshot((current) => current ?? initial);
		});
		void office.getStatus().then(setStatus);
		return () => {
			for (const unsubscribe of unsubscribers) unsubscribe();
		};
	}, []);

	return { snapshot, status };
}
