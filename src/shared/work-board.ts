import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * The left bar's work board: a window onto the app repo's Beads (bd stays the
 * only source of truth) plus a few writes. Main reads bd and computes the
 * cards; the renderer shows them by lane in the order given.
 */

/** Top to bottom in the bar. */
export const workLanes = ["in_progress", "review", "blocked", "ready", "done"] as const;
export type WorkLane = (typeof workLanes)[number];
/**
 * The bd label an engineer adds to an in-progress bead when they report it
 * done to Max: the card moves to Review until he merges (closes) it or sends
 * it back (removes the label).
 */
export const REVIEW_LABEL = "review";
/** In-progress beads turn stale after being active this long. */
export const WORK_STALE_AGE_MS = 2 * 60 * 60 * 1_000;
/** A long-running bead is stale only when its last Beads update is this old too. */
export const WORK_STALE_QUIET_MS = 45 * 60 * 1_000;

export const workPrioritySchema = z.number().int().min(0).max(4);
export type WorkPriority = 0 | 1 | 2 | 3 | 4;

export interface WorkCard {
	/** The bead id, e.g. `office-hgr.4`. */
	readonly id: string;
	readonly title: string;
	readonly priority: WorkPriority;
	readonly lane: WorkLane;
	/** bd assignee (an agent's name), or null when unassigned. */
	readonly assignee: string | null;
	/** The parent epic's title, shortened for a tag; null without a parent epic. */
	readonly epic: string | null;
	/** Open beads this one waits on (Blocked lane only). */
	readonly waitingOn: readonly string[];
	readonly description: string;
	readonly acceptance: string;
	/** ISO time of the last change, for ordering. */
	readonly updatedAt: string;
	/** ISO time the bead entered In progress; null when it has never been claimed. */
	readonly startedAt: string | null;
	/**
	 * ~USD the assignee's AI spent from the bead's start to its close (or now),
	 * in cents; null when there is no figure (not in progress or done, never
	 * started, or the assignee isn't an omp agent in the office).
	 */
	readonly spend: number | null;
	/** The same summed over the parent epic's beads (open, or closed in the last 30 days); null without one. */
	readonly epicSpend: { readonly usd: number; readonly beads: number } | null;
	/** Review cards only: whether `bead/<id>` merges cleanly into the main checkout's branch. */
	readonly merge?: MergeCheck;
}

/** `git merge-tree` of a bead's branch into the main checkout's branch. */
export type MergeCheck =
	| { readonly state: "clean" }
	| { readonly state: "conflicts"; readonly files: readonly string[] }
	/** No `bead/<id>` branch in the repo. */
	| { readonly state: "no-branch" };

/**
 * Something only Jeremy can do or decide, flagged by an agent as a bead with
 * the `human` label (`bd create "<ask>" -l human -a <agent> --deps blocks:<bead>`).
 * These never show as cards; the Trust Inbox lists them.
 */
export interface HumanAsk {
	/** The ask's own bead id. */
	readonly id: string;
	/** The one-line ask (the bead title). */
	readonly question: string;
	readonly detail: string;
	/** The agent who asked (the ask's assignee), who hears the answer; null when unknown. */
	readonly asker: string | null;
	/** Open beads waiting on the answer. */
	readonly blocks: readonly { readonly id: string; readonly title: string }[];
	readonly createdAt: string;
}

/**
 * Four honest figures about the office's throughput (no per-agent board):
 * beads (not epics or asks) closed today against yesterday (local days),
 * and today's medians. A median is null until a bead today has the data.
 */
export interface ShippingStats {
	readonly today: number;
	readonly yesterday: number;
	/** started_at → closed_at. */
	readonly leadMs: number | null;
	/** Entered Review → closed (as the board saw it enter). */
	readonly reviewMs: number | null;
	/** The assignee's AI spend from start to close (~USD). */
	readonly usd: number | null;
	/** Queue lengths now. */
	readonly ready: number;
	readonly inReview: number;
}

export type WorkBoard =
	/** Cards grouped by lane in `workLanes` order; within a lane by priority, then most recently updated. */
	| {
			readonly state: "ok";
			/** Goes up each time main sends a changed board; a write's result names the one that has it. */
			readonly revision: number;
			readonly cards: readonly WorkCard[];
			/** Open asks, most urgent (priority) first, then oldest. */
			readonly asks: readonly HumanAsk[];
			/** Every bead closed in the last 24 h (the Done lane shows only the newest few), for the Today pill. */
			readonly closedToday?: readonly string[];
			/** The office's throughput, for the TV's SHIPPING channel. */
			readonly shipping?: ShippingStats;
	  }
	/** bd is missing or failing; the bar says so instead of showing stale cards. */
	| { readonly state: "unavailable"; readonly reason: string };

export type WorkResult =
	/**
	 * bd took the write. `revision`: the first board revision that includes it.
	 * Main sends that board before this result, so by now the renderer has it
	 * (or an older one, if the write changed nothing visible).
	 */
	| { readonly ok: true; readonly revision: number }
	| { readonly ok: false; readonly reason: string };

export const WORK_TITLE_MAX = 200;
export const workTitleSchema = z.string().trim().min(1).max(WORK_TITLE_MAX);
/** Bead ids as bd prints them (`<prefix>-<hash>[.<n>…]`); renderer payloads are untrusted. */
export const workIdSchema = z
	.string()
	.regex(/^[a-z0-9][a-z0-9-]*(\.[0-9]+)*$/i)
	.max(80);
export const workLaneSchema = z.enum(workLanes);
/** An agent name, or null to unassign. */
export const workAssigneeSchema = z
	.string()
	.regex(/^[a-z][a-z0-9_-]{0,31}$/)
	.nullable();
export const WORK_RESPONSE_MAX = 2_000;
export const workResponseSchema = z.string().trim().min(1).max(WORK_RESPONSE_MAX);

/** `window.office.work`. Every write is a bd command run by main; the board refreshes after it. */
export interface WorkBoardApi {
	get(): Promise<WorkBoard>;
	/** Pushed whenever the cards change (Jeremy's writes, agents, the CLI): within ~5 s. */
	onChanged(listener: (board: WorkBoard) => void): Unsubscribe;
	/** A new task, P2, open (lands in Ready). */
	create(title: string): Promise<WorkResult>;
	setPriority(id: string, priority: WorkPriority): Promise<WorkResult>;
	/** Ready = status open; Done = bd close; out of Done reopens first. */
	move(id: string, lane: WorkLane): Promise<WorkResult>;
	assign(id: string, assignee: string | null): Promise<WorkResult>;
	/** Answer an ask: the text becomes a comment, the ask closes, the asking agent is told. */
	respond(id: string, response: string): Promise<WorkResult>;
	/** Close an ask without an answer; the asking agent is told. */
	dismiss(id: string): Promise<WorkResult>;
}
