import { type WorkCard, type WorkLane, type WorkPriority, workLanes } from "@shared/work-board";

export const laneLabels: Readonly<Record<WorkLane, string>> = {
	in_progress: "In progress",
	blocked: "Blocked",
	ready: "Ready",
	done: "Done",
};

export const priorities: readonly WorkPriority[] = [0, 1, 2, 3, 4];

/** A write the bar shows before bd confirms it; `at` becomes the card's `updatedAt`. */
export type WorkEdit =
	| { readonly kind: "move"; readonly id: string; readonly lane: WorkLane; readonly at: string }
	| {
			readonly kind: "priority";
			readonly id: string;
			readonly priority: WorkPriority;
			readonly at: string;
	  }
	| {
			readonly kind: "assign";
			readonly id: string;
			readonly assignee: string | null;
			readonly at: string;
	  };

export interface LaneGroup {
	readonly lane: WorkLane;
	readonly cards: readonly WorkCard[];
}

/** Every lane in bar order (empty ones too), each keeping the cards' given order. */
export function groupByLane(cards: readonly WorkCard[]): readonly LaneGroup[] {
	return workLanes.map((lane) => ({ lane, cards: cards.filter((card) => card.lane === lane) }));
}

/** `3 in progress · 1 blocked`: blocked only when something is. */
export function boardSummary(cards: readonly WorkCard[]): string {
	const working = cards.filter((card) => card.lane === "in_progress").length;
	const blocked = cards.filter((card) => card.lane === "blocked").length;
	return blocked > 0 ? `${working} in progress · ${blocked} blocked` : `${working} in progress`;
}

/** The collapsed bar's label; just `Work` while there are no cards to count. */
export function pillText(cards: readonly WorkCard[] | undefined): string {
	return cards ? `Work · ${boardSummary(cards)}` : "Work";
}

/** `office-344.2` → `344.2`: the bead's hash and child numbers, without the repo prefix. */
export function shortId(id: string): string {
	const dot = id.indexOf(".");
	const base = dot === -1 ? id : id.slice(0, dot);
	const dash = base.lastIndexOf("-");
	return dash === -1 ? id : id.slice(dash + 1);
}

/** Whether applying `edit` would change `card` (a write that changes nothing is skipped). */
export function editChanges(card: WorkCard, edit: WorkEdit): boolean {
	switch (edit.kind) {
		case "move":
			return card.lane !== edit.lane;
		case "priority":
			return card.priority !== edit.priority;
		case "assign":
			return card.assignee !== edit.assignee;
	}
}

function editedCard(card: WorkCard, edit: WorkEdit): WorkCard {
	switch (edit.kind) {
		case "move":
			return {
				...card,
				lane: edit.lane,
				waitingOn: edit.lane === "blocked" ? card.waitingOn : [],
				updatedAt: edit.at,
			};
		case "priority":
			return { ...card, priority: edit.priority, updatedAt: edit.at };
		case "assign":
			return { ...card, assignee: edit.assignee, updatedAt: edit.at };
	}
}

/** Where main would sort a just-updated card: first among its lane's cards of the same or lower priority. */
function insertSorted(cards: readonly WorkCard[], card: WorkCard): readonly WorkCard[] {
	const at = cards.findIndex(
		(other) => other.lane === card.lane && other.priority >= card.priority,
	);
	if (at === -1) return [...cards, card];
	return [...cards.slice(0, at), card, ...cards.slice(at)];
}

/** The cards with `edit` applied and the card re-sorted; the same array when the id is unknown or nothing changes. */
export function applyEdit(cards: readonly WorkCard[], edit: WorkEdit): readonly WorkCard[] {
	const card = cards.find((candidate) => candidate.id === edit.id);
	if (!card || !editChanges(card, edit)) return cards;
	return insertSorted(
		cards.filter((other) => other !== card),
		editedCard(card, edit),
	);
}
