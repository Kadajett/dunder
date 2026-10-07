import { readFile, writeFile } from "node:fs/promises";
import { UPDATE_BATCH_DEFAULT_MINUTES } from "@shared/app-update";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";

const log = createLogger("app-update");

/** `<userData>/update-batching.json`: how often agents' updates may apply; 0 turns batching off. */
const settingsSchema = z.object({
	intervalMinutes: z
		.number()
		.int()
		.min(0)
		.max(24 * 60)
		.default(UPDATE_BATCH_DEFAULT_MINUTES),
});

/**
 * The batch interval in ms, from the settings file. The file is written back
 * with its defaults filled in, so Jeremy finds the setting there to edit.
 */
export async function loadBatchMs(path: string): Promise<number> {
	const text = await readFile(path, "utf8").catch(() => "{}");
	let json: unknown = {};
	try {
		json = JSON.parse(text);
	} catch {
		log.warn("update-batching.json is not JSON; using the default interval", { path });
	}
	const settings = settingsSchema.safeParse(json).data ?? settingsSchema.parse({});
	await writeFile(path, `${JSON.stringify(settings, null, "\t")}\n`).catch((error: unknown) =>
		log.warn("cannot write the update batching settings", { error }),
	);
	return settings.intervalMinutes * 60_000;
}

/** When the batch window after the last applied update ends; null when there is none (never applied, or batching off). */
export function batchUntil(lastAppliedAt: number | undefined, batchMs: number): number | null {
	return lastAppliedAt === undefined || batchMs === 0 ? null : lastAppliedAt + batchMs;
}
