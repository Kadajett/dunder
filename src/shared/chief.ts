import { z } from "zod";
import type { AvatarStyle } from "./avatar/style";
import type { AgentStatus } from "./herdr/schema";
import type { Unsubscribe } from "./screens";

/** The Chief of Staff: one omp agent Jeremy chats with to run the rest of the office. */
export const CHIEF_NAME = "max";
export const CHIEF_ROLE = "chief-of-staff";
/** herdr workspace (office room) the chief works in. */
export const CHIEF_WORKSPACE = "hq";
/** Starts every chat message typed into the chief, so his replies can be told apart. */
export const CHIEF_PROMPT_PREFIX = "[Jeremy via the office]";
/** Chat history kept on disk and shown in the dock. */
export const CHIEF_HISTORY_LIMIT = 200;
export const CHIEF_MESSAGE_MAX = 8_000;

export const chiefMessageSchema = z.object({
	id: z.string().min(1).max(128),
	/** `you` is Jeremy; `chief` is the Chief of Staff. */
	author: z.enum(["you", "chief"]),
	text: z.string().min(1).max(64_000),
	/** Epoch milliseconds. */
	at: z.number().int().nonnegative(),
	/** Delivery state of Jeremy's messages; chief replies carry none. */
	state: z.enum(["sent", "queued", "rejected"]).optional(),
	/** Why a message is queued or was rejected. */
	reason: z.string().max(500).optional(),
});
export type ChiefMessage = z.infer<typeof chiefMessageSchema>;

export const chiefSendSchema = z.string().trim().min(1).max(CHIEF_MESSAGE_MAX);

/** `offline`: on the roster but not running in the office session right now. */
export type ChiefPresence = AgentStatus | "offline";

export interface ChiefStatus {
	readonly name: string;
	readonly role: string;
	readonly status: ChiefPresence;
	readonly model?: string;
	/** The chief's fixed look, from the roster. */
	readonly style: AvatarStyle;
}

export interface ChiefSendResult {
	readonly state: "sent" | "queued" | "rejected";
	readonly reason?: string;
}

/** `window.office.chief`: chat with the Chief of Staff. */
export interface ChiefApi {
	/** Null while no chief is on the roster. */
	status(): Promise<ChiefStatus | null>;
	history(): Promise<readonly ChiefMessage[]>;
	/** New messages and updates to existing ones (same `id`, e.g. queued → sent). */
	onMessage(listener: (message: ChiefMessage) => void): Unsubscribe;
	send(text: string): Promise<ChiefSendResult>;
}
