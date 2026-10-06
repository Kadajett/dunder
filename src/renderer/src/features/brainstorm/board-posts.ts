import type { WhiteboardChange } from "@shared/whiteboard";
import { plainText } from "@shared/whiteboard-text";
import { isShape } from "@tldraw/tlschema";
import { create } from "zustand";

/** An agent's latest note or text on the whiteboard, for its speech bubble. */
export interface BoardPost {
	readonly text: string;
	/** Epoch milliseconds the app heard of it. */
	readonly at: number;
}

/** How long the bubble with a fresh post stays up. */
export const POST_BUBBLE_MS = 20_000;

export const useBoardPosts = create<{ readonly posts: Readonly<Record<string, BoardPost>> }>(
	() => ({
		posts: {},
	}),
);

/** The words of an agent's post: its note's or text's rich text. */
export function postText(change: WhiteboardChange): string | undefined {
	if (change.cause.kind !== "note" && change.cause.kind !== "text") return undefined;
	const words = change.cause.records.flatMap((record) => {
		if (!isShape(record) || (record.type !== "note" && record.type !== "text")) return [];
		return [plainText(record.props.richText)];
	});
	return words.join("\n").trim() || undefined;
}

/** Remember every agent post main announces (App mounts this once). */
export function connectBoardPosts(): () => void {
	if (!("whiteboard" in window.office)) return () => undefined;
	return window.office.whiteboard.onChanged((change) => {
		const text = postText(change);
		if (!text || (change.cause.kind !== "note" && change.cause.kind !== "text")) return;
		const by = change.cause.by;
		useBoardPosts.setState((state) => ({
			posts: { ...state.posts, [by]: { text, at: Date.now() } },
		}));
	});
}

/** What `agentName` just posted on the board, while its bubble is up. */
export function freshPost(
	posts: Readonly<Record<string, BoardPost>>,
	agentName: string,
	now: number,
): BoardPost | undefined {
	const post = Object.hasOwn(posts, agentName) ? posts[agentName] : undefined;
	return post && now - post.at < POST_BUBBLE_MS ? post : undefined;
}
