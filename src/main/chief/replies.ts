import { CHIEF_PROMPT_PREFIX } from "@shared/chief";
import { z } from "zod";

/** Starts a teammate's report relayed into the chief; those turns are for Jeremy too. */
const OFFICE_MESSAGE_PREFIX = "[office message from ";

/** Whether the chief's next assistant turns answer Jeremy (or relay a teammate to him). */
export interface ReplyState {
	readonly listening: boolean;
}

export const INITIAL_REPLY_STATE: ReplyState = { listening: false };

/** Visible assistant text from one session log entry, meant for Jeremy. */
export interface ChiefReply {
	readonly entryId: string;
	readonly text: string;
	/** Epoch milliseconds, from the entry timestamp. */
	readonly at: number;
}

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
type MessageEntry = z.infer<typeof messageEntrySchema>;

function parseEntry(line: string): MessageEntry | undefined {
	// Cheap pre-filter: other entry types (compaction, custom, …) can be megabytes.
	if (!line.includes('"type":"message"')) return;
	try {
		const parsed = messageEntrySchema.safeParse(JSON.parse(line));
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

function textParts(content: MessageEntry["message"]["content"]): string[] {
	if (typeof content === "string") return [content];
	return content.flatMap((part) =>
		part.type === "text" && typeof part.text === "string" ? [part.text] : [],
	);
}

function isForJeremy(entry: MessageEntry): boolean {
	const first = textParts(entry.message.content)[0]?.trimStart() ?? "";
	return first.startsWith(CHIEF_PROMPT_PREFIX) || first.startsWith(OFFICE_MESSAGE_PREFIX);
}

function replyOf(entry: MessageEntry): ChiefReply | undefined {
	const parts = textParts(entry.message.content).map((part) => part.trim());
	const text = parts.filter((part) => part.length > 0).join("\n\n");
	const at = Date.parse(entry.timestamp);
	if (text.length === 0 || Number.isNaN(at)) return;
	return { entryId: entry.id, text, at };
}

/**
 * Fold the chief's session log lines into replies for Jeremy. A user turn
 * prefixed by the office (Jeremy's chat or a teammate's report) opens
 * listening; any other user turn (calisthenics, etc.) closes it. While
 * listening, every assistant message with visible text is one reply, so
 * interim updates across a tool loop surface as they are written.
 */
export function extractReplies(
	state: ReplyState,
	lines: readonly string[],
): { state: ReplyState; replies: ChiefReply[] } {
	let listening = state.listening;
	const replies: ChiefReply[] = [];
	for (const line of lines) {
		const entry = parseEntry(line);
		if (entry?.message.role === "user") listening = isForJeremy(entry);
		else if (entry?.message.role === "assistant" && listening) {
			const reply = replyOf(entry);
			if (reply) replies.push(reply);
		}
	}
	return { state: listening === state.listening ? state : { listening }, replies };
}
