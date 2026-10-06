import "./speech.css";
import { Html } from "@react-three/drei";
import { type ReactNode, useEffect, useState } from "react";
import { freshPost, useBoardPosts } from "../../brainstorm/board-posts";
import { speechFor, useConversations } from "./conversation-store";
import { speechView } from "./speech-view";

const MAX_CHARS = 140;
/** The waiting mark sits this much lower than a bubble's anchor: just over the head, not floating. */
const MARK_DROP = 0.4;
const OVERLAY_STYLE = { pointerEvents: "none" } as const;

/** Re-render once a second so bubbles expire on time. */
function useNow(): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, []);
	return now;
}

function clip(text: string): string {
	return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}

/** Screen-space overlay at `height` over the agent; never takes the pointer. */
function Overlay(props: { readonly height: number; readonly children: ReactNode }) {
	return (
		<Html position={[0, props.height, 0]} center zIndexRange={[60, 50]} style={OVERLAY_STYLE}>
			{props.children}
		</Html>
	);
}

function Bubble(props: {
	readonly kind: string;
	readonly to: string;
	readonly children: ReactNode;
}) {
	return (
		<div className={`speech-bubble speech-${props.kind}`}>
			<span className="speech-to">→ {props.to.toUpperCase()}</span>
			{props.children}
		</div>
	);
}

/**
 * Over an agent: a comic speech bubble while it talks to a colleague, or
 * reads out the note it just put on the whiteboard. While its message waits
 * for the colleague to be free, only a faint "…" mark, with the words on
 * hover. Rendered in the agent's body space, so it follows them as they walk.
 */
export function SpeechBubble({
	agentName,
	height,
	hovered,
}: {
	readonly agentName: string;
	readonly height: number;
	/** The pointer is over this agent: reveal the waiting caption. */
	readonly hovered: boolean;
}) {
	const heard = useConversations((state) => state.heard);
	const posts = useBoardPosts((state) => state.posts);
	const now = useNow();
	const speech = speechFor(heard, agentName, now);
	const post = speech ? undefined : freshPost(posts, agentName, now);
	const view = speechView(speech, post?.text, hovered);
	if (!view) return null;
	switch (view.kind) {
		case "board":
			return (
				<Overlay height={height}>
					<Bubble kind="saying" to="board">
						<p>{clip(view.text)}</p>
					</Bubble>
				</Overlay>
			);
		case "saying":
			return (
				<Overlay height={height}>
					<Bubble kind="saying" to={view.to}>
						<p>{clip(view.text)}</p>
					</Bubble>
				</Overlay>
			);
		case "waiting":
			if (view.caption === null) {
				return (
					<Overlay height={height - MARK_DROP}>
						<span className="speech-waiting-mark" role="img" aria-label={`waiting for ${view.to}`}>
							<i />
							<i />
							<i />
						</span>
					</Overlay>
				);
			}
			return (
				<Overlay height={height}>
					<Bubble kind="waiting" to={view.to}>
						<p className="speech-thought">{view.caption}</p>
					</Bubble>
				</Overlay>
			);
	}
}
