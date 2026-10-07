import type { ChiefPresence } from "@shared/chief";
import { useEffect, useState } from "react";
import { keepCall, resumeAfterUpdate } from "./call-keep";
import { isMuteChord, MUTE_CHORD_LABEL } from "./call-keys";
import {
	hangUp,
	loadVoiceAvailability,
	notePresence,
	startCall,
	toggleMute,
	useCall,
} from "./call-store";
import { callLabel } from "./call-turn";
import { LevelMeter } from "./LevelMeter";
import { MicPanel } from "./MicPanel";
import "./call.css";
import { useShortcutSheet } from "../../../shortcuts";

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
 * not: his presence drives the strip, and the mute chord works everywhere.
 */
export function useCallWiring(presence: ChiefPresence): void {
	const active = useCall((state) => state.active);
	useEffect(keepCall, []);
	// After an update relaunch during a call, the call picks up again by itself.
	useEffect(() => void loadVoiceAvailability().then(resumeAfterUpdate), []);
	useEffect(() => notePresence(presence), [presence]);
	useEffect(() => {
		if (!active) return;
		const onKey = (event: KeyboardEvent): void => {
			if (useShortcutSheet.getState().open || !isMuteChord(event)) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) toggleMute();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [active]);
	// A call ends with the dock (renderer reload, chief gone).
	useEffect(() => hangUp, []);
}

/** The phone in the chat header: starts a call, or says why calls are off. Gone during a call: the strip owns it. */
export function CallButton({ name }: { readonly name: string }) {
	const availability = useCall((state) => state.availability);
	const active = useCall((state) => state.active);
	if (active) return null;
	const off = availability?.available === false ? availability.reason : null;
	return (
		<button
			type="button"
			className="chief-call__start"
			aria-label={`Call ${name}`}
			title={off ? `Calls are off: ${off}` : `Call ${name}`}
			disabled={availability?.available !== true}
			onClick={startCall}
		>
			<PhoneIcon />
		</button>
	);
}

/** Above the composer during a call: a big state, the live mic, what was heard, Mic / Mute / Hang up. */
export function CallStrip({ name }: { readonly name: string }) {
	const call = useCall();
	const [micOpen, setMicOpen] = useState(false);
	if (!call.active) return null;
	const label = call.muted && call.phase === "listening" ? "Muted" : callLabel(call.phase, name);
	return (
		<section
			className="chief-call"
			aria-label={`Call with ${name}`}
			data-phase={call.phase}
			data-muted={call.muted}
		>
			<div className="chief-call__state">
				<span className="chief-call__light" aria-hidden="true" />
				<span className="chief-call__label" aria-live="polite">
					{label}
				</span>
			</div>
			<LevelMeter />
			{/* The mic check takes the 'Heard' line's place, inside the strip: the chat above stays clear. */}
			{micOpen ? (
				<MicPanel onClose={() => setMicOpen(false)} />
			) : (
				call.heard && <p className="chief-call__heard">Heard: “{call.heard}”</p>
			)}
			{call.caption && (
				<p
					className="chief-call__caption"
					aria-live="polite"
					title="Sounds are off: Max's line, unspoken"
				>
					{name}: “{call.caption}”
				</p>
			)}
			{(call.error ?? call.hint) && (
				<p className={call.error ? "chief-call__error" : "chief-call__hint"} role="status">
					{call.error ?? call.hint}
				</p>
			)}
			<div className="chief-call__controls">
				<button
					type="button"
					className="chief-call__mic"
					aria-expanded={micOpen}
					title={call.mic?.label ? `Mic: ${call.mic.label}` : "Choose and test the microphone"}
					onClick={() => setMicOpen((open) => !open)}
				>
					Mic
				</button>
				<button
					type="button"
					className="chief-call__mute"
					aria-pressed={call.muted}
					title={`${call.muted ? "Unmute" : "Mute"} your mic (${MUTE_CHORD_LABEL})`}
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
