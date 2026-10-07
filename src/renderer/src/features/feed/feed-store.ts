import type { AgentModel } from "@shared/models";
import { create } from "zustand";
import {
	eventToDraft,
	type FeedDraft,
	type FeedItem,
	learnPaneNames,
	messageToDraft,
	modelDiffDrafts,
	pushItem,
	staffOutcomeToDraft,
	workoutToDraft,
} from "./feed-model";

interface FeedState {
	/** Newest first. */
	readonly items: readonly FeedItem[];
	add(draft: FeedDraft): void;
}

let nextId = 0;

/** What the agents did lately; the Team panel shows each agent's latest line ("now"). */
export const useFeed = create<FeedState>((set) => ({
	items: [],
	add: (draft) =>
		set((state) => {
			nextId += 1;
			const items = pushItem(state.items, draft, Date.now(), `feed-${nextId}`);
			return items === state.items ? state : { items };
		}),
}));

/** Subscribe every live source to the feed; returns the cleanup. */
export function connectFeed(): () => void {
	const office = window.office;
	const { add } = useFeed.getState();
	let names: ReadonlyMap<string, string> = new Map();
	const offs: Array<() => void> = [];
	void office.getSnapshot().then((snapshot) => {
		if (snapshot) names = learnPaneNames(names, snapshot);
	});
	offs.push(
		office.onSnapshot((snapshot) => {
			names = learnPaneNames(names, snapshot);
		}),
		office.onEvent((event) => {
			const draft = eventToDraft(event, names);
			if (draft) add(draft);
		}),
	);
	if ("switchboard" in office)
		offs.push(
			office.switchboard.onMessage((message) => {
				const draft = messageToDraft(message);
				if (draft) add(draft);
			}),
		);
	if ("calisthenics" in office)
		offs.push(office.calisthenics.onWorkout((workout) => add(workoutToDraft(workout))));
	if ("staff" in office)
		offs.push(
			office.staff.onOutcome((outcome) => {
				const draft = staffOutcomeToDraft(outcome);
				if (draft) add(draft);
			}),
		);
	if ("models" in office) {
		let models: Readonly<Record<string, AgentModel>> | null = null;
		void office.models.live().then((live) => {
			models ??= live;
		});
		offs.push(
			office.models.onLive((live) => {
				if (models) for (const draft of modelDiffDrafts(models, live)) add(draft);
				models = live;
			}),
		);
	}
	return () => {
		for (const off of offs) off();
	};
}
