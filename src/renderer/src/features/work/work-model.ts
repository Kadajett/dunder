import {
	WORK_STALE_AGE_MS,
	WORK_STALE_QUIET_MS,
	type WorkCard,
	type WorkLane,
	type WorkPriority,
	workLanes,
} from "@shared/work-board";

export const laneLabels: Readonly<Record<WorkLane, string>> = {
	in_progress: "In progress",
	review: "Review",
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

/** One agent's cards (the bar's agent filter). */
export function forAgent(cards: readonly WorkCard[], agent: string): readonly WorkCard[] {
	return cards.filter((card) => card.assignee === agent);
}

/** Every lane in bar order (empty ones too), each keeping the cards' given order. */
export function groupByLane(cards: readonly WorkCard[]): readonly LaneGroup[] {
	return workLanes.map((lane) => ({ lane, cards: cards.filter((card) => card.lane === lane) }));
}

/** `3 in progress · 2 in review · 1 blocked`: review and blocked only when something is. */
export function boardSummary(cards: readonly WorkCard[]): string {
	const count = (lane: WorkLane) => cards.filter((card) => card.lane === lane).length;
	const review = count("review");
	const blocked = count("blocked");
	return [
		`${count("in_progress")} in progress`,
		...(review > 0 ? [`${review} in review`] : []),
		...(blocked > 0 ? [`${blocked} blocked`] : []),
	].join(" · ");
}

/** `2 h 40 m`: a card's age for the In progress lane. */
export function elapsedFor(since: string, now: number): string {
	const parsed = Date.parse(since);
	const start = Number.isFinite(parsed) ? parsed : now;
	const minutes = Math.max(0, Math.floor((now - start) / 60_000));
	const days = Math.floor(minutes / (24 * 60));
	if (days > 0) return `${days} d ${Math.floor((minutes % (24 * 60)) / 60)} h`;
	const hours = Math.floor(minutes / 60);
	return hours > 0 ? `${hours} h ${minutes % 60} m` : `${minutes} min`;
}

/** Quiet in-progress cards are stale only after both independent time limits pass. */
export function isStaleInProgress(card: WorkCard, now: number): boolean {
	if (card.lane !== "in_progress" || card.startedAt === null) return false;
	const startedAt = Date.parse(card.startedAt);
	const updatedAt = Date.parse(card.updatedAt);
	if (!Number.isFinite(startedAt) || !Number.isFinite(updatedAt)) return false;
	return now - startedAt > WORK_STALE_AGE_MS && now - updatedAt > WORK_STALE_QUIET_MS;
}
/** `12 min`, `3 h`, `2 d`: how long a card has waited since `since`. */
export function waitedFor(since: string, now: number): string {
	const minutes = Math.max(0, Math.floor((now - (Date.parse(since) || now)) / 60_000));
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
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
