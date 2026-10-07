import type { ChiefMessage, ChiefPresence } from "@shared/chief";

/** Where a call is, as the strip shows it. */
export type CallPhase =
	| "ready"
	| "recording"
	| "transcribing"
	| "sent"
	| "queued"
	| "working"
	| "speaking"
	| "replied";

const LABELS: Readonly<Record<CallPhase, (name: string) => string>> = {
	ready: () => "Your turn",
	recording: () => "Listening…",
	transcribing: () => "Transcribing…",
	sent: () => "Sent",
	queued: (name) => `${name} is busy; he'll hear you when he's free`,
	working: (name) => `${name} is working…`,
	speaking: (name) => `${name} is speaking…`,
	replied: (name) => `${name} replied in chat`,
};

export function callLabel(phase: CallPhase, name: string): string {
	return LABELS[phase](name);
}

/** Following the chief's answer to the last call turn, until it is spoken or he stops without one. */
export interface TurnWatch {
	/** The turn is in his prompt, not just queued. */
	readonly delivered: boolean;
	/** He has been seen working since it went in. */
	readonly sawWorking: boolean;
}

export const NEW_TURN: TurnWatch = { delivered: false, sawWorking: false };

/**
 * `finished`: he went idle after working on the turn without a spoken line
 * (yet: his last reply can still be on its way from the session log).
 */
export type PresenceStep = "none" | "working" | "finished";

export function watchPresence(
	watch: TurnWatch | null,
	presence: ChiefPresence,
): { readonly watch: TurnWatch | null; readonly step: PresenceStep } {
	if (!watch?.delivered) return { watch, step: "none" };
	if (presence === "working")
		return { watch: watch.sawWorking ? watch : { ...watch, sawWorking: true }, step: "working" };
	const finished = watch.sawWorking && (presence === "idle" || presence === "done");
	return { watch, step: finished ? "finished" : "none" };
}

/**
 * A pushed chat message during the call: Jeremy's call turn going in
 * (queued → sent) marks the turn delivered; the chief's reply with a spoken
 * line answers it. Messages from before the call never count.
 */
export function watchMessage(
	watch: TurnWatch | null,
	message: ChiefMessage,
	since: number,
): { readonly watch: TurnWatch | null; readonly spoken: string | null } {
	if (message.at < since) return { watch, spoken: null };
	if (message.author === "chief" && message.spoken !== undefined)
		return { watch: null, spoken: message.spoken };
	const goesIn = message.author === "you" && message.call === true && message.state === "sent";
	if (goesIn && watch && !watch.delivered)
		return { watch: { ...watch, delivered: true }, spoken: null };
	return { watch, spoken: null };
}
