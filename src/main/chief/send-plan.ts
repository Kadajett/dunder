import { CHIEF_PROMPT_PREFIX, type ChiefPresence } from "@shared/chief";

export type ChiefSendPlan =
	| { readonly kind: "send" }
	| { readonly kind: "queue"; readonly reason: string }
	| { readonly kind: "reject"; readonly reason: string };

/**
 * Type into the chief only while he waits for a prompt. Busy or away, the
 * message waits for his next idle moment; a pending approval needs Jeremy at
 * the chief's screen, so typing would land in the approval prompt instead.
 */
export function planChiefSend(name: string, presence: ChiefPresence): ChiefSendPlan {
	const who = name.charAt(0).toUpperCase() + name.slice(1);
	switch (presence) {
		case "idle":
		case "done":
			return { kind: "send" };
		case "working":
			return { kind: "queue", reason: `${who} is working; your message goes in when he's free` };
		case "blocked":
			return {
				kind: "reject",
				reason: `${who} is waiting on an approval — open his screen to answer it`,
			};
		default:
			return {
				kind: "queue",
				reason: `${who} isn't at his desk yet; your message goes in when he arrives`,
			};
	}
}

/** One prompt carrying every pending chat message, prefixed so his replies can be told apart. */
export function chiefPrompt(texts: readonly string[]): string {
	return `${CHIEF_PROMPT_PREFIX} ${texts.join("\n\n")}`;
}
