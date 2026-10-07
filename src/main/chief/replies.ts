import { CALL_PROMPT_PREFIX, CHIEF_PROMPT_PREFIX } from "@shared/chief";
import {
	type MessageEntry,
	parseMessageEntry,
	textParts,
	visibleText,
} from "../session-log/message-entry";

/** Starts a teammate's report relayed into the chief; those turns are for Jeremy too. */
const OFFICE_MESSAGE_PREFIX = "[office message from ";

/** Whether the chief's next assistant turns answer Jeremy (or relay a teammate to him). */
export interface ReplyState {
	readonly listening: boolean;
	/** The turn answers something Jeremy said on a call, so it ends with a `Spoken:` line. */
	readonly call: boolean;
}

export const INITIAL_REPLY_STATE: ReplyState = { listening: false, call: false };

/** Visible assistant text from one session log entry, meant for Jeremy. */
export interface ChiefReply {
	readonly entryId: string;
	readonly text: string;
	/** Epoch milliseconds, from the entry timestamp. */
	readonly at: number;
	/** Written in answer to a call turn. */
	readonly call: boolean;
}

/** Who a user turn came from, as far as the chat cares. */
function turnOf(entry: MessageEntry): ReplyState {
	const first = textParts(entry)[0]?.trimStart() ?? "";
	if (first.startsWith(CALL_PROMPT_PREFIX)) return { listening: true, call: true };
	const listening =
		first.startsWith(CHIEF_PROMPT_PREFIX) || first.startsWith(OFFICE_MESSAGE_PREFIX);
	return { listening, call: false };
}

function replyOf(entry: MessageEntry, call: boolean): ChiefReply | undefined {
	const text = visibleText(entry);
	const at = Date.parse(entry.timestamp);
	if (text.length === 0 || Number.isNaN(at)) return;
	return { entryId: entry.id, text, at, call };
}

/**
 * Fold the chief's session log lines into replies for Jeremy. A user turn
 * prefixed by the office (Jeremy's chat or call, or a teammate's report) opens
 * listening; any other user turn (calisthenics, etc.) closes it. While
 * listening, every assistant message with visible text is one reply, so
 * interim updates across a tool loop surface as they are written.
 */
export function extractReplies(
	state: ReplyState,
	lines: readonly string[],
): { state: ReplyState; replies: ChiefReply[] } {
	let turn = state;
	const replies: ChiefReply[] = [];
	for (const line of lines) {
		const entry = parseMessageEntry(line);
		if (entry?.message.role === "user") turn = turnOf(entry);
		else if (entry?.message.role === "assistant" && turn.listening) {
			const reply = replyOf(entry, turn.call);
			if (reply) replies.push(reply);
		}
	}
	const same = turn.listening === state.listening && turn.call === state.call;
	return { state: same ? state : turn, replies };
}
