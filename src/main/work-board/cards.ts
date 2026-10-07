import {
	REVIEW_LABEL,
	type WorkCard,
	type WorkLane,
	type WorkPriority,
	workLanes,
	workPrioritySchema,
} from "@shared/work-board";
import { z } from "zod";

/** The Done lane keeps only the most recently closed beads. */
export const DONE_LIMIT = 5;
/** Epic tags longer than this are cut with an ellipsis. */
export const EPIC_TAG_MAX = 24;

/** One bead as `bd list|ready|blocked --json` prints it; only the fields the board reads. */
const beadSchema = z.object({
	id: z.string(),
	title: z.string(),
	status: z.string(),
	priority: workPrioritySchema,
	issue_type: z.string().default("task"),
	assignee: z.string().nullish(),
	parent: z.string().nullish(),
	description: z.string().nullish(),
	acceptance_criteria: z.string().nullish(),
	updated_at: z.string(),
	created_at: z.string().optional(),
	/** `bd list` only; null without any. */
	labels: z.array(z.string()).nullish(),
	closed_at: z.string().nullish(),
	/** When it was claimed (moved to in progress); what a bead's spend is counted from. */
	started_at: z.string().nullish(),
	/** `bd list`: every edge, `type` "blocks" or "parent-child"; null without any. */
	dependencies: z.array(z.object({ depends_on_id: z.string(), type: z.string() })).nullish(),
	/** `bd blocked`: the open beads this one waits on. */
	blocked_by: z.array(z.string()).nullish(),
});
export type Bead = z.infer<typeof beadSchema>;

const beadsSchema = z.array(beadSchema).nullable();

/** Parse one `bd … --json` list; bd prints `null` or `[]` for nothing. */
export function parseBeads(stdout: string): Bead[] {
	return beadsSchema.parse(JSON.parse(stdout)) ?? [];
}

/** The four bd reads behind the board. */
export interface BdLists {
	/** `bd list --status=open,in_progress,blocked -n 0` (deferred beads are not in it). */
	readonly open: readonly Bead[];
	/** `bd blocked`: beads with open blockers. */
	readonly blocked: readonly Bead[];
	/** `bd ready`: open beads nothing open blocks. */
	readonly ready: readonly Bead[];
	/** `bd list --status=closed --closed-after <30 days ago> -n 0`: the Done lane and epics' spend. */
	readonly closed: readonly Bead[];
}

const EPIC_MARKER = /^\s*(?:\[epic\]|\(epic\)|epic:)\s*[:\-–—]?\s*/i;

/** An epic's title as a short tag: no leading `[epic]`/`(EPIC)` marker, at most `EPIC_TAG_MAX` chars. */
export function epicTag(title: string): string {
	const bare = title.replace(EPIC_MARKER, "").trim();
	if (bare.length <= EPIC_TAG_MAX) return bare;
	return `${bare.slice(0, EPIC_TAG_MAX - 1).trimEnd()}…`;
}

export const isEpic = (bead: Bead): boolean => bead.issue_type === "epic";
/** Asks for Jeremy (bd's `human` label) live in the Trust Inbox, not on the board (see asks.ts). */
export const isHumanAsk = (bead: Bead): boolean => (bead.labels ?? []).includes("human");
/** Reported done and waiting for Max: shown in Review while it is in progress. */
const inReview = (bead: Bead): boolean => (bead.labels ?? []).includes(REVIEW_LABEL);

function epicTitles(lists: BdLists): Map<string, string> {
	const titles = new Map<string, string>();
	for (const bead of [...lists.open, ...lists.closed]) {
		if (isEpic(bead)) titles.set(bead.id, epicTag(bead.title));
	}
	return titles;
}

/** Open "blocks" targets still on the board's open list (status `blocked` beads `bd blocked` skips). */
function openBlockers(bead: Bead, openIds: ReadonlySet<string>): string[] {
	return (bead.dependencies ?? [])
		.filter((edge) => edge.type === "blocks" && openIds.has(edge.depends_on_id))
		.map((edge) => edge.depends_on_id);
}

interface Placed {
	readonly bead: Bead;
	readonly lane: WorkLane;
	readonly waitingOn: readonly string[];
}

/** One lane per bead: in progress beats blocked beats ready. Epics and unknown (deferred) ids drop out. */
function placeOpen(lists: BdLists): Placed[] {
	const open = new Map(
		lists.open.filter((bead) => !isEpic(bead) && !isHumanAsk(bead)).map((bead) => [bead.id, bead]),
	);
	const openIds = new Set(lists.open.map((bead) => bead.id));
	const blockedBy = new Map(lists.blocked.map((bead) => [bead.id, bead.blocked_by ?? []]));
	const placed: Placed[] = [];
	for (const bead of open.values()) {
		if (bead.status === "in_progress") {
			placed.push({ bead, lane: inReview(bead) ? "review" : "in_progress", waitingOn: [] });
		} else if (bead.status === "blocked" || blockedBy.has(bead.id)) {
			const waitingOn = blockedBy.get(bead.id) ?? openBlockers(bead, openIds);
			placed.push({ bead, lane: "blocked", waitingOn });
		}
	}
	const taken = new Set(placed.map((entry) => entry.bead.id));
	for (const { id } of lists.ready) {
		const bead = open.get(id);
		if (bead && !taken.has(id)) placed.push({ bead, lane: "ready", waitingOn: [] });
	}
	return placed;
}

const closedTime = (bead: Bead): number => Date.parse(bead.closed_at ?? bead.updated_at) || 0;

/** The newest `DONE_LIMIT` non-epic beads closed since `since`. */
function placeDone(closed: readonly Bead[], since: number): Placed[] {
	return closed
		.filter((bead) => !isEpic(bead) && !isHumanAsk(bead) && closedTime(bead) >= since)
		.sort((a, b) => closedTime(b) - closedTime(a))
		.slice(0, DONE_LIMIT)
		.map((bead) => ({ bead, lane: "done", waitingOn: [] }));
}

function toCard({ bead, lane, waitingOn }: Placed, epics: ReadonlyMap<string, string>): WorkCard {
	return {
		id: bead.id,
		title: bead.title,
		// workPrioritySchema bounds it to 0-4.
		priority: bead.priority as WorkPriority,
		lane,
		assignee: bead.assignee || null,
		epic: (bead.parent && epics.get(bead.parent)) || null,
		waitingOn,
		description: bead.description ?? "",
		acceptance: bead.acceptance_criteria ?? "",
		updatedAt: bead.updated_at,
		startedAt: bead.started_at ?? null,
		// Priced by the service, which knows the agents' spend (see spend.ts).
		spend: null,
		epicSpend: null,
	};
}

function compareCards(a: WorkCard, b: WorkCard): number {
	const lanes = workLanes.indexOf(a.lane) - workLanes.indexOf(b.lane);
	if (lanes !== 0) return lanes;
	// Review is Max's queue: oldest first (last update, since bd keeps no label time).
	if (a.lane === "review")
		return (
			(Date.parse(a.updatedAt) || 0) - (Date.parse(b.updatedAt) || 0) || a.id.localeCompare(b.id)
		);
	return (
		a.priority - b.priority ||
		(Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) ||
		a.id.localeCompare(b.id)
	);
}

/**
 * The board's cards from bd's lists: grouped by lane, then by priority, then
 * most recently updated. Done shows beads closed since `doneSince`.
 */
export function buildCards(lists: BdLists, doneSince: number): WorkCard[] {
	const epics = epicTitles(lists);
	return [...placeOpen(lists), ...placeDone(lists.closed, doneSince)]
		.map((placed) => toCard(placed, epics))
		.sort(compareCards);
}
