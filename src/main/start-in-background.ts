import { createLogger } from "@shared/log/logger";

/** Let a service start without holding up the app: a failure is logged under `scope`, never thrown. */
export function startInBackground(scope: string, started: Promise<unknown>): void {
	started.catch((error: unknown) => createLogger(scope).warn("not started", { error }));
}
