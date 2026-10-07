import "./speech.css";
import { Html } from "@react-three/drei";
import { type ReactNode, useEffect, useReducer } from "react";
import {
	type BoardPost,
	freshPost,
	POST_BUBBLE_MS,
	useBoardPosts,
} from "../../brainstorm/board-posts";
import { type Speech, speechFor, useConversations } from "./conversation-store";
import { type SpeechView, speechView } from "./speech-view";

const MAX_CHARS = 140;
/** Marks (blocked "!", waiting "…") sit this much lower than a bubble's anchor: just over the head. */
const MARK_DROP = 0.4;
const OVERLAY_STYLE = { pointerEvents: "none" } as const;

/**
 * Re-render once at `at` (ms), when what the bubble shows times out; nothing
 * ticks while it shows nothing or something with no deadline (a waiting mark).
 */
function useRenderAt(at: number | null): void {
	const [, rerender] = useReducer((count: number) => count + 1, 0);
	useEffect(() => {
		if (at === null) return;
		let timer = 0;
		// A timer can fire a hair early; re-render only once `at` has really passed.
		const fire = (): void => {
			const left = at - Date.now();
			if (left > 0) timer = window.setTimeout(fire, left);
			else rerender();
		};
		fire();
		return () => window.clearTimeout(timer);
	}, [at]);
}

/** When the speech or board post on show stops being shown; null when nothing on show times out. */
function shownUntil(speech: Speech | undefined, post: BoardPost | undefined): number | null {
	if (speech?.kind === "saying") return speech.until;
	return post ? post.at + POST_BUBBLE_MS : null;
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

/** The words of a bubble for `view`; the bare waiting mark is drawn with the status marks instead. */
function bubbleFor(view: SpeechView): ReactNode {
	switch (view.kind) {
		case "board":
			return (
				<Bubble kind="saying" to="board">
					<p>{clip(view.text)}</p>
				</Bubble>
			);
		case "saying":
			return (
				<Bubble kind="saying" to={view.to}>
					<p>{clip(view.text)}</p>
				</Bubble>
			);
		case "waiting":
			return view.caption === null ? null : (
				<Bubble kind="waiting" to={view.to}>
					<p className="speech-thought">{view.caption}</p>
				</Bubble>
			);
	}
}

/**
 * Over an agent: a comic speech bubble while it talks to a colleague, or
 * reads out the note it just put on the whiteboard. Just over the head, small
 * marks: a red "!" while it is blocked on the human, and a faint "…" while its
 * message waits for a colleague (the words on hover). Rendered in the agent's
 * body space, so everything follows them as they walk.
 */
export function SpeechBubble({
	agentName,
	height,
	hovered,
	blocked,
}: {
	readonly agentName: string;
	readonly height: number;
	/** The pointer is over this agent: reveal the waiting caption. */
	readonly hovered: boolean;
	/** The agent waits on the human (an approval, a question). */
	readonly blocked: boolean;
}) {
	const heard = useConversations((state) => state.heard);
	const posts = useBoardPosts((state) => state.posts);
	const now = Date.now();
	const speech = speechFor(heard, agentName, now);
	const post = speech ? undefined : freshPost(posts, agentName, now);
	useRenderAt(shownUntil(speech, post));
	const view = speechView(speech, post?.text, hovered);
	const waitingFor = view?.kind === "waiting" && view.caption === null ? view.to : null;
	const bubble = view ? bubbleFor(view) : null;
	return (
		<>
			{bubble ? <Overlay height={height}>{bubble}</Overlay> : null}
			{blocked || waitingFor ? (
				<Overlay height={height - MARK_DROP}>
					<span className="agent-marks">
						{blocked ? (
							<span className="agent-blocked-mark" role="img" aria-label="blocked, needs you">
								!
							</span>
						) : null}
						{waitingFor ? (
							<span
								className="speech-waiting-mark"
								role="img"
								aria-label={`waiting for ${waitingFor}`}
							>
								<i />
								<i />
								<i />
							</span>
						) : null}
					</span>
				</Overlay>
			) : null}
		</>
	);
}
