import { createLogger } from "@shared/log/logger";
import { app } from "electron";
import { z } from "zod";
import { RELAUNCH_EXIT_CODE, SUPERVISED_ENV } from "./supervisor";

const log = createLogger("app-update");

/** Injected by electron.vite.config.ts: "dev" under the dev server. */
declare const __OFFICE_BUILD__: unknown;

const buildSchema = z.union([
	z.literal("dev"),
	z.object({ commit: z.string().nullable(), builtAt: z.string() }),
]);

/** The commit the running build was made from; undefined under the dev server or without git. */
export function builtCommit(): string | undefined {
	const parsed = buildSchema.safeParse(
		typeof __OFFICE_BUILD__ === "undefined" ? "dev" : __OFFICE_BUILD__,
	);
	if (!parsed.success || parsed.data === "dev") return undefined;
	return parsed.data.commit ?? undefined;
}

/**
 * Quit and start again on the build now in `out/`. The herdr agents live in
 * the detached `office` server, not in this process, so they keep running
 * straight through the restart; only Jeremy's window goes away for a moment.
 */
export async function relaunchApp(shutdown: () => Promise<void>): Promise<void> {
	// Best effort: a screen that will not let go must not block the update.
	await shutdown().catch((error: unknown) =>
		log.warn("shutdown before relaunch failed", { error }),
	);
	log.info("relaunching on the new build");
	if (process.env[SUPERVISED_ENV] === "1") {
		app.exit(RELAUNCH_EXIT_CODE);
		return;
	}
	app.relaunch();
	app.exit(0);
}
