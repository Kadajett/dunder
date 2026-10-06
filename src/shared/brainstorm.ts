import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * A brainstorm: the office gathers by the whiteboard on a topic. Agents walk
 * over, get a prompt with the topic and the board, and post sticky notes with
 * `office-board`; ending it sends everyone back to their desks.
 */
export interface Brainstorm {
	readonly id: string;
	readonly topic: string;
	/** Epoch milliseconds. */
	readonly startedAt: number;
	/** Who started it: an agent's name, or "Jeremy" from the HUD. */
	readonly by: string;
	/** The agents taking part, by name (everyone in the office when it started). */
	readonly agents: readonly string[];
}

export const BRAINSTORM_TOPIC_MAX = 200;

export const brainstormTopicSchema = z.string().trim().min(1).max(BRAINSTORM_TOPIC_MAX);

/** One line of the brainstorm-requests file, appended by `office-brainstorm`. */
export const brainstormRequestLineSchema = z.discriminatedUnion("op", [
	z.strictObject({
		v: z.literal(1),
		id: z.string().min(8).max(64),
		/** herdr pane of the requester (`HERDR_PANE_ID`), mapped to its agent by the app. */
		fromPane: z.string().min(1).max(64),
		op: z.literal("start"),
		topic: brainstormTopicSchema,
		requestedAt: z.iso.datetime(),
	}),
	z.strictObject({
		v: z.literal(1),
		id: z.string().min(8).max(64),
		fromPane: z.string().min(1).max(64),
		op: z.literal("end"),
		requestedAt: z.iso.datetime(),
	}),
]);
export type BrainstormRequestLine = z.infer<typeof brainstormRequestLineSchema>;

/** `window.office.brainstorm`. */
export interface BrainstormApi {
	/** The running brainstorm, or null. */
	current(): Promise<Brainstorm | null>;
	onChanged(listener: (brainstorm: Brainstorm | null) => void): Unsubscribe;
	/** Jeremy starts one from the HUD (replacing any running one). */
	start(topic: string): Promise<void>;
	end(): Promise<void>;
}
