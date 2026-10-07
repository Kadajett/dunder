import type { OfficeMessage } from "@shared/switchboard";
import { create } from "zustand";
import type { VisitWindow } from "../behaviour/brain";
import type { Placement } from "../scene/station";

/**
 * How long a speech bubble stays up after its message is delivered. Long enough
 * for the speaker to walk over to the colleague and chat a little.
 */
export const BUBBLE_MS = 20_000;
const LIMIT = 50;

export interface Heard {
	readonly message: OfficeMessage;
	/** Local time this message last changed state (queued → delivered/failed). */
	readonly changedAt: number;
}

interface ConversationState {
	/** Most recent first, capped. */
	readonly heard: readonly Heard[];
	upsert(message: OfficeMessage, now: number): void;
	replace(messages: readonly OfficeMessage[], now: number): void;
}

export const useConversations = create<ConversationState>((set) => ({
	heard: [],
	upsert: (message, now) =>
		set((state) => {
			const previous = state.heard.find((item) => item.message.id === message.id);
			const changedAt = previous?.message.state === message.state ? previous.changedAt : now;
			const others = state.heard.filter((item) => item.message.id !== message.id);
			return { heard: [{ message, changedAt }, ...others].slice(0, LIMIT) };
		}),
	// History from before this window opened: never shown as fresh speech.
	replace: (messages, now) =>
		set({
			heard: [...messages].reverse().map((message) => ({ message, changedAt: now - BUBBLE_MS })),
		}),
}));

export type Speech =
	/** `until`: when the bubble stops being shown (ms). */
	| { readonly kind: "saying"; readonly message: OfficeMessage; readonly until: number }
	| { readonly kind: "waiting"; readonly message: OfficeMessage };

/**
 * What an agent is saying right now: a just-delivered message (speech bubble),
 * or one still waiting for its recipient to be free (a faint waiting mark).
 */
export function speechFor(
	heard: readonly Heard[],
	agentName: string,
	now: number,
): Speech | undefined {
	const latest = heard.find((item) => item.message.from === agentName);
	if (!latest) return undefined;
	const { message } = latest;
	if (message.state === "queued") return { kind: "waiting", message };
	const until = latest.changedAt + BUBBLE_MS;
	if (message.state === "delivered" && now < until) return { kind: "saying", message, until };
	return undefined;
}

/** Connect the store to the main-process switchboard (call once per window). */
export function connectConversations(): () => void {
	const api = window.office.switchboard;
	const store = useConversations.getState();
	void api.recent().then((messages) => store.replace(messages, Date.now()));
	return api.onMessage((message) => store.upsert(message, Date.now()));
}

/**
 * The colleague visit an agent should be on right now: while its delivered
 * message is still being "said", it walks over to the recipient. Times are
 * converted from wall-clock ms to the brain's clock (`brainNow`, seconds).
 */
export function visitFor(
	heard: readonly Heard[],
	agentName: string,
	clock: { readonly nowMs: number; readonly brainNow: number },
	spotFor: (name: string) => Placement | undefined,
): VisitWindow | undefined {
	const latest = heard.find((item) => item.message.from === agentName);
	if (latest?.message.state !== "delivered") return undefined;
	const remainingMs = latest.changedAt + BUBBLE_MS - clock.nowMs;
	if (remainingMs <= 0) return undefined;
	const at = spotFor(latest.message.to);
	return at ? { id: latest.message.id, at, until: clock.brainNow + remainingMs / 1000 } : undefined;
}
