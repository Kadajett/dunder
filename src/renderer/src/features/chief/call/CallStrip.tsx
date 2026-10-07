import type { ChiefPresence } from "@shared/chief";
import { useEffect } from "react";
import {
	hangUp,
	loadVoiceAvailability,
	notePresence,
	startCall,
	startTalking,
	stopTalking,
	toggleMute,
	toggleTalking,
	useCall,
} from "./call-store";
import { callLabel } from "./call-turn";
import "./call.css";

/** Talk start/stop from anywhere, a focused terminal included (captured before it). */
export const TALK_CHORD_LABEL = "Ctrl+Shift+Space";

function isTalkChord(event: KeyboardEvent): boolean {
	return (
		event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "Space"
	);
}

function PhoneIcon() {
	return (
		<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
			<path
				fill="currentColor"
				d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
			/>
		</svg>
	);
}

/**
 * Keeps a call in step with the chief while the dock is mounted, chat open or
 * not: his presence drives the strip, and the talk chord works everywhere.
 */
export function useCallWiring(presence: ChiefPresence): void {
	const active = useCall((state) => state.active);
	useEffect(() => void loadVoiceAvailability(), []);
	useEffect(() => notePresence(presence), [presence]);
	useEffect(() => {
		if (!active) return;
		const onKey = (event: KeyboardEvent): void => {
			if (!isTalkChord(event)) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) toggleTalking();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [active]);
	// A call ends with the dock (renderer reload, chief gone).
	useEffect(() => hangUp, []);
}

/** The phone in the chat header: starts a call, or says why calls are off. */
export function CallButton({ name }: { readonly name: string }) {
	const availability = useCall((state) => state.availability);
	const active = useCall((state) => state.active);
	const off = availability?.available === false ? availability.reason : null;
	const title = off ? `Calls are off: ${off}` : active ? `On a call with ${name}` : `Call ${name}`;
	return (
		<button
			type="button"
			className={`chief-call__start${active ? " chief-call__start--live" : ""}`}
			aria-label={`Call ${name}`}
			title={title}
			disabled={availability?.available !== true || active}
			onClick={startCall}
		>
			<PhoneIcon />
		</button>
	);
}

/** Above the composer during a call: state, Talk (hold, or the chord), mute and hang up. */
export function CallStrip({ name }: { readonly name: string }) {
	const call = useCall();
	if (!call.active) return null;
	const recording = call.phase === "recording";
	const busy = call.phase === "transcribing";
	return (
		<section className="chief-call" aria-label={`Call with ${name}`} data-phase={call.phase}>
			<div className="chief-call__state">
				<span className="chief-call__light" aria-hidden="true" />
				<span className="chief-call__label" aria-live="polite">
					{callLabel(call.phase, name)}
				</span>
			</div>
			{(call.error ?? call.hint) && (
				<p className={call.error ? "chief-call__error" : "chief-call__hint"} role="status">
					{call.error ?? call.hint}
				</p>
			)}
			<div className="chief-call__controls">
				<button
					type="button"
					className="chief-call__talk"
					aria-pressed={recording}
					disabled={busy}
					title={`Hold to talk, or press ${TALK_CHORD_LABEL} to start and stop`}
					onPointerDown={(event) => {
						event.currentTarget.setPointerCapture(event.pointerId);
						startTalking();
					}}
					onPointerUp={() => void stopTalking()}
					onPointerCancel={() => void stopTalking()}
				>
					{recording ? "Release to send" : "Hold to talk"}
					<span className="chief-call__chord">{TALK_CHORD_LABEL}</span>
				</button>
				<button
					type="button"
					className="chief-call__mute"
					aria-pressed={call.muted}
					title={call.muted ? `Unmute ${name}'s voice` : `Mute ${name}'s voice (captions stay)`}
					onClick={toggleMute}
				>
					{call.muted ? "Unmute" : "Mute"}
				</button>
				<button type="button" className="chief-call__hangup" onClick={hangUp}>
					Hang up
				</button>
			</div>
		</section>
	);
}
