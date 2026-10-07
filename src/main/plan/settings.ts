import { readFile, writeFile } from "node:fs/promises";
import { createLogger } from "@shared/log/logger";
import { z } from "zod";
import { dailyTimeSchema } from "../calisthenics/schedule";

const log = createLogger("plan");

/**
 * `<userData>/morning-plan.json`: when Max is asked for the day's plan, how
 * long he waits for Jeremy before going ahead, and the day he was last asked.
 */
export const planSettingsSchema = z.object({
	dailyTime: dailyTimeSchema.default("09:00"),
	proceedAfterMinutes: z
		.number()
		.int()
		.min(5)
		.max(24 * 60)
		.default(60),
	/** Local `YYYY-MM-DD` Max was last asked to propose a plan. */
	lastPromptDate: z.string().optional(),
});
export type PlanSettings = z.infer<typeof planSettingsSchema>;

export const DEFAULT_PLAN_SETTINGS: PlanSettings = planSettingsSchema.parse({});

/** A missing file yields the defaults; a corrupt one is reported, then ignored. */
export async function loadPlanSettings(path: string): Promise<PlanSettings> {
	const text = await readFile(path, "utf8").catch(() => null);
	if (text === null) return DEFAULT_PLAN_SETTINGS;
	try {
		return planSettingsSchema.parse(JSON.parse(text));
	} catch (error) {
		log.warn("ignoring invalid morning plan settings", { path, error });
		return DEFAULT_PLAN_SETTINGS;
	}
}

export async function savePlanSettings(path: string, settings: PlanSettings): Promise<void> {
	await writeFile(path, `${JSON.stringify(settings, null, "\t")}\n`, "utf8");
}
