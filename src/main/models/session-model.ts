import { z } from "zod";

/** What an omp session log says its agent is running. */
export interface SessionModel {
	readonly model: string | undefined;
	readonly thinking: string | undefined;
	/** Number of `model_change` entries seen; a pending switch lands when this grows. */
	readonly modelChanges: number;
}

export const NO_SESSION_MODEL: SessionModel = {
	model: undefined,
	thinking: undefined,
	modelChanges: 0,
};

const entrySchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("model_change"), model: z.string().min(1) }),
	z.object({ type: z.literal("thinking_level_change"), thinkingLevel: z.string().nullish() }),
]);

function parseEntry(line: string): z.infer<typeof entrySchema> | undefined {
	// Cheap pre-filter: message lines can be megabytes and never change the model.
	if (!line.includes('"model_change"') && !line.includes('"thinking_level_change"')) return;
	try {
		const parsed = entrySchema.safeParse(JSON.parse(line));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Fold session log lines (`{"type":"model_change","model":…}` and
 * `{"type":"thinking_level_change","thinkingLevel":…}`) into the latest
 * model state. Returns the same object when no line changes anything.
 */
export function applyModelLines(state: SessionModel, lines: readonly string[]): SessionModel {
	let next = state;
	for (const line of lines) {
		const entry = parseEntry(line);
		if (entry?.type === "model_change") {
			next = { ...next, model: entry.model, modelChanges: next.modelChanges + 1 };
		} else if (entry?.type === "thinking_level_change") {
			next = { ...next, thinking: entry.thinkingLevel ?? undefined };
		}
	}
	return next;
}
