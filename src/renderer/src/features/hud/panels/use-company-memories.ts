import type { CompanyMemories } from "@shared/office-stats";
import { useCallback, useEffect, useRef, useState } from "react";

/** How often an open Brain panel re-reads memory, so agents' new insights show up. */
const REFRESH_MS = 30_000;

export type MemoriesLoad =
	| { readonly state: "loading" }
	/** The running main/preload predates multi-project memory: the app needs a restart. */
	| { readonly state: "restart" }
	| { readonly state: "ready"; readonly memories: CompanyMemories };

export interface CompanyMemoriesHandle {
	readonly load: MemoriesLoad;
	readonly reload: () => void;
}

/**
 * Company memory while the Brain panel is open: read on open, every 30 s,
 * and whenever `reload` is called (after Remember/Forget). The last result
 * stays on screen while a refresh is in flight.
 */
export function useCompanyMemories(): CompanyMemoriesHandle {
	const [load, setLoad] = useState<MemoriesLoad>({ state: "loading" });
	const latest = useRef(0);
	const reload = useCallback(() => {
		const stats = "stats" in window.office ? window.office.stats : undefined;
		if (!stats || !("remember" in stats)) {
			setLoad({ state: "restart" });
			return;
		}
		const request = ++latest.current;
		void stats.memories().then((memories) => {
			if (request !== latest.current) return;
			// An older main answers `{state, cwd, memories}` for a single project.
			setLoad(
				Array.isArray(memories.projects) ? { state: "ready", memories } : { state: "restart" },
			);
		});
	}, []);
	useEffect(() => {
		reload();
		const timer = setInterval(reload, REFRESH_MS);
		return () => clearInterval(timer);
	}, [reload]);
	return { load, reload };
}
