import type { HerdrEvent, SessionSnapshot } from "@shared/herdr/schema";
import { z } from "zod";

export type ActivityTone = "working" | "blocked" | "done" | "idle" | "neutral";

export interface ActivityItem {
	readonly id: number;
	/** Epoch ms when the renderer received the event. */
	readonly at: number;
	readonly text: string;
	readonly tone: ActivityTone;
}

/** Friendly names for ids that appear in event payloads. */
export interface ActivityNames {
	readonly panes: ReadonlyMap<string, string>;
	readonly workspaces: ReadonlyMap<string, string>;
}

/** Remember every agent/pane and workspace name seen so far; closed panes keep their name. */
export function learnNames(names: ActivityNames, snapshot: SessionSnapshot): ActivityNames {
	const panes = new Map(names.panes);
	const workspaces = new Map(names.workspaces);
	for (const pane of snapshot.panes) if (pane.label) panes.set(pane.pane_id, pane.label);
	for (const agent of snapshot.agents) if (agent.name) panes.set(agent.pane_id, agent.name);
	for (const ws of snapshot.workspaces) workspaces.set(ws.workspace_id, ws.label);
	return { panes, workspaces };
}

// Event payloads are untrusted and vary by kind: pick out the few fields the ticker shows.
const named = z.object({ label: z.string().optional() }).optional().catch(undefined);
const eventFieldsSchema = z.object({
	pane_id: z.string().optional().catch(undefined),
	workspace_id: z.string().optional().catch(undefined),
	agent_status: z.string().optional().catch(undefined),
	agent: z.string().nullish().catch(undefined),
	label: z.string().optional().catch(undefined),
	pane: z.object({ pane_id: z.string() }).optional().catch(undefined),
	workspace: named,
	tab: named,
});

const STATUS_TEXT: Record<string, { readonly verb: string; readonly tone: ActivityTone }> = {
	working: { verb: "started working", tone: "working" },
	blocked: { verb: "is blocked: needs you", tone: "blocked" },
	done: { verb: "finished", tone: "done" },
	idle: { verb: "went idle", tone: "idle" },
};

/**
 * Topology churn that would drown the ticker. Keys use herdr's `noun_verb` wire names;
 * per-pane subscriptions arrive dotted (`pane.agent_status_changed`), so names are
 * normalised to underscores first.
 */
const NOISE: Record<string, true> = {
	layout_updated: true,
	workspace_updated: true,
	workspace_moved: true,
	workspace_reordered: true,
	workspace_metadata_updated: true,
	workspace_focused: true,
	tab_moved: true,
	tab_focused: true,
	pane_moved: true,
	pane_focused: true,
	pane_updated: true,
	pane_output_changed: true,
};

type EventFields = z.infer<typeof eventFieldsSchema>;

interface Subject {
	/** Agent/pane name, else the pane id. */
	readonly who: string;
	/** Workspace label, else its id; "" when the event names no workspace. */
	readonly where: string;
	readonly data: EventFields;
}

/** Ticker text for the neutral (non-status) events worth a line. */
const NEUTRAL_TEXT: Record<string, (subject: Subject) => string> = {
	pane_agent_detected: ({ who, data }) => `${data.agent ?? "an agent"} showed up in ${who}`,
	pane_created: ({ who }) => `new pane ${who}`,
	pane_closed: ({ who, where }) => `${who} left ${where}`.trimEnd(),
	pane_exited: ({ who, where }) => `${who} left ${where}`.trimEnd(),
	workspace_created: ({ data }) => `workspace ${data.workspace?.label ?? ""} opened`,
	workspace_renamed: ({ data }) => `workspace renamed to ${data.label ?? "?"}`,
	workspace_closed: ({ where, data }) => `workspace ${data.workspace?.label ?? where} closed`,
	tab_created: ({ data }) => `new tab ${data.tab?.label ?? ""}`.trimEnd(),
	tab_renamed: ({ data }) => `tab renamed to ${data.label ?? "?"}`,
	tab_closed: ({ where }) => `a tab closed in ${where}`,
};

/** One ticker line for a herdr event, or null for events not worth a line. */
export function describeEvent(
	event: HerdrEvent,
	names: ActivityNames,
): { readonly text: string; readonly tone: ActivityTone } | null {
	const kind = event.event.replaceAll(".", "_");
	if (NOISE[kind]) return null;
	const data = eventFieldsSchema.parse(event.data);
	const paneId = data.pane_id ?? data.pane?.pane_id;
	const who = paneId ? (names.panes.get(paneId) ?? paneId) : "someone";
	const where = data.workspace_id
		? (names.workspaces.get(data.workspace_id) ?? data.workspace_id)
		: "";
	if (kind === "pane_agent_status_changed") {
		const status = STATUS_TEXT[data.agent_status ?? ""];
		return status ? { text: `${who} ${status.verb}`, tone: status.tone } : null;
	}
	const neutral = NEUTRAL_TEXT[kind];
	const text = neutral ? neutral({ who, where, data }) : kind.replaceAll("_", " ");
	return { text, tone: "neutral" };
}
