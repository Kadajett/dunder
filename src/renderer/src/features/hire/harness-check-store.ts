import type { Harness } from "@shared/company/roster";
import type { HarnessCheck } from "@shared/company/workforce";
import { createLogger } from "@shared/log/logger";
import { useEffect } from "react";
import { create } from "zustand";

const log = createLogger("workforce");

/** A check this old is asked again the next time something shows it. */
const FRESH_MS = 60_000;

interface Entry {
	readonly check: HarnessCheck | "checking";
	readonly at: number;
}

const useChecks = create<{ readonly checks: Partial<Record<Harness, Entry>> }>(() => ({
	checks: {},
}));

function set(harness: Harness, check: Entry["check"]): void {
	useChecks.setState((state) => ({
		checks: { ...state.checks, [harness]: { check, at: Date.now() } },
	}));
}

/** Ask main once per harness per minute, however many cards show it. */
function refresh(harness: Harness): void {
	if (!("workforce" in window.office) || !("checkHarness" in window.office.workforce)) return;
	const entry = useChecks.getState().checks[harness];
	if (entry && (entry.check === "checking" || Date.now() - entry.at < FRESH_MS)) return;
	set(harness, "checking");
	window.office.workforce.checkHarness(harness).then(
		(check) => set(harness, check),
		(error: unknown) => {
			log.warn("harness check failed", { harness, error });
			set(harness, { state: "unknown", reason: `couldn't check ${harness}` });
		},
	);
}

/**
 * Whether a worker on `harness` could answer now (CLI there, logged in), as
 * main checked it; 'checking' meanwhile, null when nothing is asked or the
 * preload predates the check.
 */
export function useHarnessCheck(harness: Harness | null): HarnessCheck | "checking" | null {
	const entry = useChecks((state) => (harness ? state.checks[harness] : undefined));
	useEffect(() => {
		if (harness) refresh(harness);
	}, [harness]);
	return entry?.check ?? null;
}
