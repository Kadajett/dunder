import { z } from "zod";

/** Lifecycle states herdr reports for an agent occupying a pane. */
export const agentStatusSchema = z.enum(["idle", "working", "blocked", "done", "unknown"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

const optionalString = z
	.string()
	.nullish()
	.transform((value) => value ?? undefined);

export const workspaceInfoSchema = z.object({
	workspace_id: z.string(),
	label: z.string(),
	number: z.number(),
	focused: z.boolean(),
	agent_status: agentStatusSchema,
	pane_count: z.number(),
	tab_count: z.number(),
	active_tab_id: optionalString,
});
export type WorkspaceInfo = z.infer<typeof workspaceInfoSchema>;

export const tabInfoSchema = z.object({
	tab_id: z.string(),
	workspace_id: z.string(),
	label: z.string(),
	number: z.number(),
	focused: z.boolean(),
	agent_status: agentStatusSchema,
	pane_count: z.number(),
});
export type TabInfo = z.infer<typeof tabInfoSchema>;

export const paneInfoSchema = z.object({
	pane_id: z.string(),
	tab_id: z.string(),
	workspace_id: z.string(),
	terminal_id: z.string(),
	focused: z.boolean(),
	agent_status: agentStatusSchema,
	agent: optionalString,
	label: optionalString,
	cwd: optionalString,
	foreground_cwd: optionalString,
	terminal_title_stripped: optionalString,
});
export type PaneInfo = z.infer<typeof paneInfoSchema>;

export const agentInfoSchema = paneInfoSchema.extend({
	/** Agent kind label, e.g. `omp`, `claude`, `codex`. */
	agent: z.string(),
	/** Unique live agent name; absent until named. */
	name: optionalString,
	interactive_ready: z.boolean().optional(),
	state_change_seq: z.number().optional(),
});
export type AgentInfo = z.infer<typeof agentInfoSchema>;

export const sessionSnapshotSchema = z.object({
	version: z.string(),
	protocol: z.number(),
	workspaces: z.array(workspaceInfoSchema),
	tabs: z.array(tabInfoSchema),
	panes: z.array(paneInfoSchema),
	agents: z.array(agentInfoSchema),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

/** One pushed event from `events.subscribe`. `data` stays opaque beyond its kind. */
export const herdrEventSchema = z.object({
	event: z.string(),
	data: z.record(z.string(), z.unknown()),
});
export type HerdrEvent = z.infer<typeof herdrEventSchema>;
