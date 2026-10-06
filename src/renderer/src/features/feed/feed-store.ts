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
	workoutToDraft,
} from "./feed-model";

interface FeedState {
	readonly items: readonly FeedItem[];
	/** Items added since the feed was last expanded. */
	readonly unseen: number;
	readonly expanded: boolean;
	add(draft: FeedDraft): void;
	toggle(): void;
}

let nextId = 0;

export const useFeed = create<FeedState>((set) => ({
	items: [],
	unseen: 0,
	expanded: false,
	add: (draft) =>
		set((state) => {
			nextId += 1;
			const items = pushItem(state.items, draft, Date.now(), `feed-${nextId}`);
			if (items === state.items) return state;
			return { items, unseen: state.expanded ? 0 : state.unseen + 1 };
		}),
	toggle: () => set((state) => ({ expanded: !state.expanded, unseen: 0 })),
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
