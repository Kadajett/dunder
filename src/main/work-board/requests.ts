import {
	type WorkPriority,
	type WorkResult,
	workAssigneeSchema,
	workIdSchema,
	workLaneSchema,
	workPrioritySchema,
	workResponseSchema,
	workTitleSchema,
} from "@shared/work-board";
import { z } from "zod";
import type { WorkBoardService } from "./service";

const priorityRequestSchema = z.strictObject({ id: workIdSchema, priority: workPrioritySchema });
const moveRequestSchema = z.strictObject({ id: workIdSchema, lane: workLaneSchema });
const assignRequestSchema = z.strictObject({ id: workIdSchema, assignee: workAssigneeSchema });
const respondRequestSchema = z.strictObject({ id: workIdSchema, response: workResponseSchema });

export type WorkWrites = Pick<
	WorkBoardService,
	"create" | "setPriority" | "move" | "assign" | "respond" | "dismiss"
>;

/** The write handlers behind `window.office.work`; renderer payloads are untrusted. */
export interface WorkRequestHandlers {
	create(payload: unknown): Promise<WorkResult>;
	setPriority(payload: unknown): Promise<WorkResult>;
	move(payload: unknown): Promise<WorkResult>;
	assign(payload: unknown): Promise<WorkResult>;
	respond(payload: unknown): Promise<WorkResult>;
	dismiss(payload: unknown): Promise<WorkResult>;
}

/** Validate a payload, then run the write; a bad payload never reaches bd. */
function guarded<T>(
	schema: z.ZodType<T>,
	run: (request: T) => Promise<WorkResult>,
): (payload: unknown) => Promise<WorkResult> {
	return (payload) => {
		const parsed = schema.safeParse(payload);
		if (parsed.success) return run(parsed.data);
		return Promise.resolve({
			ok: false,
			reason: `invalid request: ${z.prettifyError(parsed.error)}`,
		});
	};
}

export function workRequestHandlers(writes: WorkWrites): WorkRequestHandlers {
	return {
		create: guarded(workTitleSchema, (title) => writes.create(title)),
		setPriority: guarded(priorityRequestSchema, ({ id, priority }) =>
			// workPrioritySchema bounds it to 0-4.
			writes.setPriority(id, priority as WorkPriority),
		),
		move: guarded(moveRequestSchema, ({ id, lane }) => writes.move(id, lane)),
		assign: guarded(assignRequestSchema, ({ id, assignee }) => writes.assign(id, assignee)),
		respond: guarded(respondRequestSchema, ({ id, response }) => writes.respond(id, response)),
		dismiss: guarded(workIdSchema, (id) => writes.dismiss(id)),
	};
}
