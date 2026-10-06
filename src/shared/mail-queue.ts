import type { ChiefMessage } from "./chief";
import type { Unsubscribe } from "./screens";
import type { OfficeMessage } from "./switchboard";

/**
 * Mail waiting for an agent: `office-say` messages the switchboard holds until
 * the recipient is free, and (for the Chief of Staff) Jeremy's chat messages
 * waiting for his next idle moment. The office shows them as sticky notes.
 */
export interface QueuedNote {
	readonly id: string;
	/** `jeremy` for his chat messages, otherwise the sending agent. */
	readonly from: string;
	readonly fromJeremy: boolean;
	/** The first few words, for a hover caption. */
	readonly preview: string;
	/** When it was sent (ms since the epoch); notes are ordered oldest first. */
	readonly at: number;
}

/** Queued notes per recipient agent name; agents with nothing waiting are absent. */
export type MailQueue = Readonly<Record<string, readonly QueuedNote[]>>;

export interface MailQueueApi {
	get(): Promise<MailQueue>;
	onChange(listener: (queue: MailQueue) => void): Unsubscribe;
}

export const PREVIEW_CHARS = 40;

/** One line of at most `PREVIEW_CHARS`, cut with an ellipsis. */
export function previewOf(text: string): string {
	const line = text.replace(/\s+/g, " ").trim();
	return line.length <= PREVIEW_CHARS ? line : `${line.slice(0, PREVIEW_CHARS - 1).trimEnd()}…`;
}

/**
 * Who has mail waiting, from the latest state of each switchboard message and
 * each of Jeremy's chat messages (queued until the chief, `chiefName`, is free).
 */
export function queuedMail(
	agentMail: Iterable<OfficeMessage>,
	chiefMail: Iterable<ChiefMessage>,
	chiefName: string | undefined,
): MailQueue {
	type Addressed = { readonly to: string; readonly note: QueuedNote };
	const fromAgents = [...agentMail]
		.filter((message) => message.state === "queued")
		.map(
			(message): Addressed => ({
				to: message.to,
				note: {
					id: message.id,
					from: message.from,
					fromJeremy: false,
					preview: previewOf(message.text),
					at: Date.parse(message.sentAt),
				},
			}),
		);
	const fromJeremy =
		chiefName === undefined
			? []
			: [...chiefMail]
					.filter((message) => message.author === "you" && message.state === "queued")
					.map(
						(message): Addressed => ({
							to: chiefName,
							note: {
								id: message.id,
								from: "jeremy",
								fromJeremy: true,
								preview: previewOf(message.text),
								at: message.at,
							},
						}),
					);
	const queue: Record<string, QueuedNote[]> = {};
	for (const { to, note } of [...fromAgents, ...fromJeremy].sort((a, b) => a.note.at - b.note.at))
		queue[to] = [...(queue[to] ?? []), note];
	return queue;
}
