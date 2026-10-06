import { z } from "zod";
import { harnessSchema } from "./company/roster";
import { hireNameSchema } from "./company/workforce";
import type { Unsubscribe } from "./screens";

/** Requests older than this (e.g. made while the app was closed) are ignored. */
export const STAFF_REQUEST_MAX_AGE_MS = 10 * 60 * 1000;
/** Longest custom brief `office-staff hire --brief` may carry. */
export const STAFF_BRIEF_MAX = 8_000;

const nameSchema = z.string().min(1).max(64);
const modelSpecSchema = z.string().trim().min(1).max(200);

/** What `office-staff` asks for; the app re-validates hires against the roster and catalog. */
export const staffActionSchema = z.discriminatedUnion("action", [
	z.strictObject({
		action: z.literal("hire"),
		name: hireNameSchema,
		role: z.string().trim().min(1).max(200),
		harness: harnessSchema.optional(),
		/** `selector[:thinking]`, e.g. `anthropic/claude-opus-5-5:high`. */
		model: modelSpecSchema.optional(),
		/** Office room (herdr workspace label); the app picks one when omitted. */
		room: z.string().trim().min(1).max(64).optional(),
		cwd: z.string().trim().min(1).max(4_096).optional(),
		/** Extra brief appended after the role's archetype brief. */
		brief: z.string().trim().min(1).max(STAFF_BRIEF_MAX).optional(),
	}),
	z.strictObject({ action: z.literal("fire"), name: nameSchema }),
	z.strictObject({ action: z.literal("restart"), name: nameSchema }),
	z.strictObject({ action: z.literal("model"), name: nameSchema, model: modelSpecSchema }),
	z.strictObject({ action: z.literal("list") }),
]);
export type StaffAction = z.infer<typeof staffActionSchema>;

/** One line of the staff-requests file, appended by `office-staff`. */
export const staffRequestLineSchema = z.object({
	v: z.literal(1),
	id: z.string().min(8).max(64),
	/** herdr pane of the requester (`HERDR_PANE_ID`); only the chief of staff's pane is honoured. */
	fromPane: z.string().min(1).max(64),
	requestedAt: z.iso.datetime(),
	request: staffActionSchema,
});
export type StaffRequestLine = z.infer<typeof staffRequestLineSchema>;

/** One line of the staff-results file: what became of request `id`, for `office-staff` to print. */
export interface StaffResultLine {
	readonly v: 1;
	readonly id: string;
	readonly ok: boolean;
	/** Human-readable outcome (an error when `ok` is false; the roster for `list`). */
	readonly message: string;
}

/** A handled request, for the Activity Feed. */
export interface StaffOutcome {
	readonly id: string;
	/** Who asked: the requester's agent name, or its pane when it is not an agent. */
	readonly by: string;
	readonly action: StaffAction["action"];
	/** The worker acted on; absent for `list`. */
	readonly name?: string;
	readonly ok: boolean;
	readonly message: string;
}

/** `window.office.staff`. */
export interface StaffApi {
	onOutcome(listener: (outcome: StaffOutcome) => void): Unsubscribe;
}
