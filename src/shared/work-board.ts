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

export type WorkBoard =
	/** Cards grouped by lane in `workLanes` order; within a lane by priority, then most recently updated. */
	| {
			readonly state: "ok";
			readonly cards: readonly WorkCard[];
			/** Open asks, most urgent (priority) first, then oldest. */
			readonly asks: readonly HumanAsk[];
	  }
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
