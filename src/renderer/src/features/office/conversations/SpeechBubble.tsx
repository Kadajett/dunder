import "./speech.css";
import { Html } from "@react-three/drei";
import { useEffect, useState } from "react";
import { speechFor, useConversations } from "./conversation-store";

const MAX_CHARS = 140;
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

/**
 * A comic speech bubble over an agent while it talks to a colleague (or a
 * thought bubble while its message waits for the colleague to be free).
 * Rendered in the agent's body space, so it follows them as they walk.
 */
export function SpeechBubble({
	agentName,
	height,
}: {
	readonly agentName: string;
	readonly height: number;
}) {
	const heard = useConversations((state) => state.heard);
	const speech = speechFor(heard, agentName, useNow());
	if (!speech) return null;
	const { message } = speech;
	return (
		<Html position={[0, height, 0]} center zIndexRange={[60, 50]} style={OVERLAY_STYLE}>
			<div className={`speech-bubble speech-${speech.kind}`}>
				<span className="speech-to">→ {message.to.toUpperCase()}</span>
				{speech.kind === "saying" ? (
					<p>{clip(message.text)}</p>
				) : (
					<p className="speech-thought">waiting for {message.to} to be free…</p>
				)}
			</div>
		</Html>
	);
}
