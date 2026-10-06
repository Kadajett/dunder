import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { dailyTimeSchema } from "./schedule";

/** `<userData>/calisthenics.json`: when the daily workout runs and when it last did. */
export const settingsSchema = z.object({
	dailyTime: dailyTimeSchema.default("15:00"),
	/** Local `YYYY-MM-DD` of the last daily workout. */
	lastRunDate: z.string().optional(),
});
export type CalisthenicsSettings = z.infer<typeof settingsSchema>;

const DEFAULTS: CalisthenicsSettings = settingsSchema.parse({});

/** A missing or unreadable file yields the defaults; a corrupt one is reported, then ignored. */
export async function loadSettings(path: string): Promise<CalisthenicsSettings> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return DEFAULTS;
	}
	try {
		return settingsSchema.parse(JSON.parse(text));
	} catch (error) {
		console.warn(`[calisthenics] ignoring invalid ${path}:`, error);
		return DEFAULTS;
	}
}

export async function saveSettings(path: string, settings: CalisthenicsSettings): Promise<void> {
	await writeFile(path, `${JSON.stringify(settings, null, "\t")}\n`, "utf8");
}
