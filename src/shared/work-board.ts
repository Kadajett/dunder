import { z } from "zod";
import type { Unsubscribe } from "./screens";

/**
 * The left bar's work board: a window onto the app repo's Beads (bd stays the
 * only source of truth) plus a few writes. Main reads bd and computes the
 * cards; the renderer shows them by lane in the order given.
 */

/** Top to bottom in the bar. */
export const workLanes = ["in_progress", "blocked", "ready", "done"] as const;
export type WorkLane = (typeof workLanes)[number];

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
}

export type WorkBoard =
	/** Cards grouped by lane in `workLanes` order; within a lane by priority, then most recently updated. */
	| { readonly state: "ok"; readonly cards: readonly WorkCard[] }
	/** bd is missing or failing; the bar says so instead of showing stale cards. */
	| { readonly state: "unavailable"; readonly reason: string };

export type WorkResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

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
}
