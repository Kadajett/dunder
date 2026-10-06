import type { Workout } from "@shared/calisthenics";
import type { HerdrEvent, SessionSnapshot } from "@shared/herdr/schema";
import { type AgentModel, shortModelName } from "@shared/models";
import type { OfficeMessage } from "@shared/switchboard";
import { z } from "zod";

export type FeedTone = "working" | "blocked" | "done" | "idle" | "message" | "office" | "neutral";

/** One card in the Activity Feed: `13:20  Agent: action`. */
export interface FeedItem {
	readonly id: string;
	/** Epoch ms. */
	readonly at: number;
	/** Bold lead, e.g. `Ava` or `Jonas → Nora`. */
	readonly agent: string;
	readonly action: string;
	readonly tone: FeedTone;
	/** Pane to select on click, when the item is about one agent. */
	readonly paneId?: string;
}

export type FeedDraft = Omit<FeedItem, "id" | "at">;

export const FEED_LIMIT = 60;

/** Capitalise an agent name for display: `nora` → `Nora`. */
export function displayName(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}

/** pane id → agent/pane name; closed panes keep their name. */
export function learnPaneNames(
	names: ReadonlyMap<string, string>,
	snapshot: SessionSnapshot,
): ReadonlyMap<string, string> {
	const next = new Map(names);
	for (const pane of snapshot.panes) if (pane.label) next.set(pane.pane_id, pane.label);
	for (const agent of snapshot.agents) if (agent.name) next.set(agent.pane_id, agent.name);
	return next;
}

const eventFieldsSchema = z.object({
	pane_id: z.string().optional().catch(undefined),
	agent_status: z.string().optional().catch(undefined),
	agent: z.string().nullish().catch(undefined),
	name: z.string().nullish().catch(undefined),
	pane: z.object({ pane_id: z.string(), label: z.string().nullish() }).optional().catch(undefined),
});

const STATUS: Record<string, { readonly action: string; readonly tone: FeedTone }> = {
	working: { action: "started working", tone: "working" },
	blocked: { action: "needs you (blocked)", tone: "blocked" },
	done: { action: "finished — waiting for you", tone: "done" },
	idle: { action: "went idle", tone: "idle" },
};

const LIFECYCLE: Record<string, (kind: string | undefined) => string> = {
	pane_agent_detected: (kind) => `joined the office${kind ? ` (${kind})` : ""}`,
	pane_created: () => "opened a new pane",
	pane_closed: () => "left the office",
	pane_exited: () => "left the office",
};

/** Feed draft for a herdr event; null for noise and unknown kinds. */
export function eventToDraft(
	event: HerdrEvent,
	names: ReadonlyMap<string, string>,
): FeedDraft | null {
	const kind = event.event.replaceAll(".", "_");
	const parsed = eventFieldsSchema.safeParse(event.data);
	if (!parsed.success) return null;
	const data = parsed.data;
	const paneId = data.pane_id ?? data.pane?.pane_id;
	if (!paneId) return null;
	const name = data.name ?? names.get(paneId) ?? data.pane?.label ?? paneId;
	const agent = displayName(name);
	if (kind === "pane_agent_status_changed") {
		const status = STATUS[data.agent_status ?? ""];
		return status ? { agent, action: status.action, tone: status.tone, paneId } : null;
	}
	const lifecycle = LIFECYCLE[kind];
	if (!lifecycle) return null;
	return { agent, action: lifecycle(data.agent ?? undefined), tone: "neutral", paneId };
}

/** Feed draft for a switchboard message; only delivered mail is shown. */
export function messageToDraft(message: OfficeMessage): FeedDraft | null {
	if (message.state !== "delivered") return null;
	return {
		agent: `${displayName(message.from)} → ${displayName(message.to)}`,
		action: message.text,
		tone: "message",
	};
}

export function workoutToDraft(workout: Workout): FeedDraft {
	const n = workout.agents.length;
	return {
		agent: "Office",
		action: `calisthenics break (${n} agent${n === 1 ? "" : "s"})`,
		tone: "office",
	};
}

function modelLabel(model: AgentModel): string {
	const name = shortModelName(model.model).replace(/\b\w/g, (c) => c.toUpperCase());
	return model.thinking ? `${name} · ${model.thinking}` : name;
}

/** One draft per agent whose model or thinking level changed between two live maps. */
export function modelDiffDrafts(
	previous: Readonly<Record<string, AgentModel>>,
	next: Readonly<Record<string, AgentModel>>,
): FeedDraft[] {
	const drafts: FeedDraft[] = [];
	for (const [name, model] of Object.entries(next)) {
		const before = previous[name];
		if (!before || !model.model) continue;
		if (before.model === model.model && before.thinking === model.thinking) continue;
		drafts.push({
			agent: displayName(name),
			action: `now on ${modelLabel(model)}`,
			tone: "neutral",
		});
	}
	return drafts;
}

/**
 * Prepend a draft (newest first), capped at FEED_LIMIT. Returns the same list when the
 * draft repeats the latest line about the same subject (duplicate transition).
 */
export function pushItem(
	items: readonly FeedItem[],
	draft: FeedDraft,
	at: number,
	id: string,
): readonly FeedItem[] {
	const subject = draft.paneId ?? draft.agent;
	const last = items.find((item) => (item.paneId ?? item.agent) === subject);
	if (last && last.action === draft.action && draft.tone !== "message") return items;
	return [{ ...draft, id, at }, ...items].slice(0, FEED_LIMIT);
}

/** `13:20` in local time. */
export function formatClock(at: number): string {
	const date = new Date(at);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
