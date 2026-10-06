import type { Speech } from "./conversation-store";

/** What floats over an agent: a bubble that speaks, or the faint waiting mark. */
export type SpeechView =
	| { readonly kind: "board"; readonly text: string }
	| { readonly kind: "saying"; readonly to: string; readonly text: string }
	/** A message waits for its recipient: a small mark, with the words only on hover. */
	| { readonly kind: "waiting"; readonly to: string; readonly caption: string | null };

/**
 * Pick what to show over an agent. A fresh whiteboard note is read out only
 * while the agent isn't in a conversation; a waiting message shows its
 * caption only while the pointer is over the agent, so it never covers the room.
 */
export function speechView(
	speech: Speech | undefined,
	postText: string | undefined,
	hovered: boolean,
): SpeechView | undefined {
	if (!speech) return postText === undefined ? undefined : { kind: "board", text: postText };
	const { to, text } = speech.message;
	if (speech.kind === "saying") return { kind: "saying", to, text };
	return { kind: "waiting", to, caption: hovered ? `waiting for ${to} to be free…` : null };
}
