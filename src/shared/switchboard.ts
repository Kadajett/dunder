import { z } from "zod";

/**
 * Agent-to-agent messages. An agent runs `office-say <to> <text>` in its pane;
 * the CLI appends one `MailLine` to the mailbox file; the app delivers it to the
 * recipient with `herdr agent prompt` and shows the exchange in the office.
 */
export const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

export const mailLineSchema = z.strictObject({
	v: z.literal(1),
	id: z.string().min(8).max(64),
	/** herdr pane of the sender (`HERDR_PANE_ID`), mapped to its agent by the app. */
	fromPane: z.string().max(64).optional(),
	to: z.string().regex(AGENT_NAME),
	text: z.string().min(1).max(4_000),
	sentAt: z.iso.datetime(),
});
export type MailLine = z.infer<typeof mailLineSchema>;

export type DeliveryState = "queued" | "delivered" | "failed";

/** One message as the office shows it. */
export interface OfficeMessage {
	readonly id: string;
	/** Sender's agent name, or "someone" when it came from outside an agent pane. */
	readonly from: string;
	readonly to: string;
	readonly text: string;
	readonly sentAt: string;
	readonly state: DeliveryState;
	readonly error?: string;
}

/** The text the recipient's agent receives. */
export function deliveryText(message: Pick<OfficeMessage, "from" | "text">): string {
	const reply =
		message.from === "someone"
			? ""
			: `\n\n(If a reply is needed: office-say ${message.from} "<your reply>". Don't reply just to acknowledge or say thanks.)`;
	return `[office message from ${message.from}] ${message.text}${reply}`;
}

/** Messages one pair of agents may exchange per window before the switchboard stops a ping-pong. */
export const PAIR_LIMIT = { messages: 6, windowMs: 10 * 60 * 1000 } as const;

/**
 * Whether delivering `message` would push its pair (in either direction) past
 * `PAIR_LIMIT` — agents politely thanking each other forever burn tokens.
 */
export function exceedsPairLimit(
	history: readonly Pick<OfficeMessage, "from" | "to" | "sentAt" | "state">[],
	message: Pick<OfficeMessage, "from" | "to">,
	nowMs: number,
): boolean {
	const pair = new Set([message.from, message.to]);
	const recent = history.filter(
		(other) =>
			other.state === "delivered" &&
			pair.has(other.from) &&
			pair.has(other.to) &&
			nowMs - Date.parse(other.sentAt) < PAIR_LIMIT.windowMs,
	);
	return recent.length >= PAIR_LIMIT.messages;
}
