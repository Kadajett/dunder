import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * Snoozing a Trust Inbox item: an ask, or a blocked agent, leaves the inbox
 * (and its alerts) until a chosen time, then comes back as new. App-side only:
 * the ask's bead is never touched.
 */

/** How long: an hour, four hours, or until 9:00 the next morning (local time). */
export const snoozeChoices = ["1h", "4h", "morning"] as const;
export type SnoozeChoice = (typeof snoozeChoices)[number];
export const snoozeChoiceSchema = z.enum(snoozeChoices);

/** `ask:<bead id>` or `blocked:<agent name>` (names, not panes: panes change on respawn). */
export const snoozeKeySchema = z.string().regex(/^(ask|blocked):[^\s]{1,200}$/);

export interface Snooze {
	readonly key: string;
	/** Epoch milliseconds. */
	readonly until: number;
}

export const snoozeSchema = z.object({ key: snoozeKeySchema, until: z.number().int() });

export const askSnoozeKey = (id: string): string => `ask:${id}`;
export const blockedSnoozeKey = (agentName: string): string => `blocked:${agentName}`;

/** `window.office.snoozes`. */
export interface InboxSnoozeApi {
	/** The snoozes still running. */
	list(): Promise<readonly Snooze[]>;
	onChanged(listener: (snoozes: readonly Snooze[]) => void): Unsubscribe;
	snooze(key: string, choice: SnoozeChoice): Promise<void>;
	unsnooze(key: string): Promise<void>;
}
