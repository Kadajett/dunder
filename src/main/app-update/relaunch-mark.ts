import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";

const log = createLogger("app-update");

const markSchema = z.object({ at: z.number().int().nonnegative() });

const markPath = (userData: string): string => join(userData, "update-relaunch.json");

/**
 * Note that this process is about to relaunch for an update (or a rollback),
 * so the next launch can tell it from a quit or a crash. Best effort: the
 * relaunch goes ahead without it.
 */
export async function markUpdateRelaunch(userData: string, at: number): Promise<void> {
	await writeFile(markPath(userData), `${JSON.stringify({ at })}\n`, "utf8").catch(
		(error: unknown) => log.warn("cannot mark the update relaunch", { error }),
	);
}

/** When the last process went down for an update relaunch; read once (the mark is removed), null when it didn't. */
export async function takeUpdateRelaunch(userData: string): Promise<number | null> {
	const path = markPath(userData);
	const text = await readFile(path, "utf8").catch(() => null);
	if (text === null) return null;
	await rm(path, { force: true });
	try {
		const parsed = markSchema.safeParse(JSON.parse(text));
		return parsed.success ? parsed.data.at : null;
	} catch {
		return null;
	}
}
