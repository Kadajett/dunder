import { open } from "node:fs/promises";
import type { AgentReply } from "@shared/agent-replies";
import { parseMessageEntry, visibleText } from "../session-log/message-entry";
import { plainText } from "./plain-text";

/** Only the log's end is read: a session log runs to hundreds of megabytes. */
export const TAIL_BYTES = 256 * 1024;

/**
 * The agent's final reply of its last turn: the last assistant message with
 * visible text after the last user message. A last turn that ended without
 * text (only tool calls) has none, rather than an earlier turn's.
 */
export function lastTurnReply(lines: readonly string[]): AgentReply | null {
	let reply: AgentReply | null = null;
	for (const line of lines) {
		const entry = parseMessageEntry(line);
		if (entry?.message.role === "user") reply = null;
		if (entry?.message.role !== "assistant") continue;
		const text = visibleText(entry);
		const at = Date.parse(entry.timestamp);
		if (text && !Number.isNaN(at)) reply = { text: plainText(text), at };
	}
	return reply;
}

/** The last `bytes` of a file as whole lines (a line cut by the start is dropped), and its size. */
export async function readTail(
	path: string,
	bytes = TAIL_BYTES,
): Promise<{ readonly lines: string[]; readonly size: number }> {
	const file = await open(path, "r");
	try {
		const { size } = await file.stat();
		const start = Math.max(0, size - bytes);
		const buffer = Buffer.alloc(size - start);
		await file.read(buffer, 0, buffer.length, start);
		const lines = buffer.toString("utf8").split("\n");
		return { lines: start > 0 ? lines.slice(1) : lines, size };
	} finally {
		await file.close();
	}
}
