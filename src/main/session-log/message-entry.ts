import { z } from "zod";

/**
 * One `message` line of an omp session log (JSONL): a user or assistant turn
 * with its parts. Shared by everything that reads agents' conversations.
 */

// Unknown part types (thinking, toolCall, images, future kinds) pass through and are skipped.
const contentPartSchema = z.looseObject({ type: z.string(), text: z.unknown().optional() });

const messageEntrySchema = z.object({
	type: z.literal("message"),
	id: z.string().min(1),
	timestamp: z.string(),
	message: z.object({
		role: z.string(),
		content: z.union([z.string(), z.array(contentPartSchema)]),
	}),
});
export type MessageEntry = z.infer<typeof messageEntrySchema>;

/** The line as a message entry; undefined for any other entry or a broken line. */
export function parseMessageEntry(line: string): MessageEntry | undefined {
	// Cheap pre-filter: other entry types (compaction, custom, …) can be megabytes.
	if (!line.includes('"type":"message"')) return;
	try {
		const parsed = messageEntrySchema.safeParse(JSON.parse(line));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

/** The entry's text parts, as written (thinking, tool calls and images skipped). */
export function textParts(entry: MessageEntry): string[] {
	const { content } = entry.message;
	if (typeof content === "string") return [content];
	return content.flatMap((part) =>
		part.type === "text" && typeof part.text === "string" ? [part.text] : [],
	);
}

/** The entry's visible text: non-empty text parts, trimmed, a blank line apart; empty if none. */
export function visibleText(entry: MessageEntry): string {
	return textParts(entry)
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join("\n\n");
}
