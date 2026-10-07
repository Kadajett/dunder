import type { ChiefMessage, ChiefPresence } from "@shared/chief";
import { createLogger } from "@shared/log/logger";
import type { VoiceAvailability } from "@shared/voice";
import { create } from "zustand";
import { sendToChief } from "../chat-store";
import { chime, playMp3, type Recording, startRecording, stopPlayback } from "./call-audio";
import { type CallPhase, NEW_TURN, type TurnWatch, watchMessage, watchPresence } from "./call-turn";

const log = createLogger("call");

/** A turn auto-stops and sends after this long. */
export const TURN_MAX_MS = 60_000;
/** Shorter than this is a tap, not speech: nothing is sent (or paid for). */
const TURN_MIN_MS = 400;
/** After he goes idle, how long his spoken line may still take to come out of the session log. */
const SPOKEN_GRACE_MS = 3_000;

interface CallState {
	/** Null until asked; calls need the ElevenLabs key in main. */
	readonly availability: VoiceAvailability | null;
	readonly active: boolean;
	readonly phase: CallPhase;
	/** Max's voice is off: no TTS requests, captions only. */
	readonly muted: boolean;
	/** `Voice error: …` or `Not sent: …`, until the next turn. */
	readonly error: string | null;
	/** A gentle note, e.g. "Didn't catch that". */
	readonly hint: string | null;
	readonly watch: TurnWatch | null;
	/** When the call started; earlier messages never count. */
	readonly since: number;
}

export const useCall = create<CallState>(() => ({
	availability: null,
	active: false,
	phase: "ready",
	muted: false,
	error: null,
	hint: null,
	watch: null,
	since: 0,
}));

const voiceApi = () => ("voice" in window.office ? window.office.voice : null);

/** Side effects of the call in progress; reset by hang-up. */
let recording: Promise<Recording | null> | null = null;
let capTimer: number | undefined;
let graceTimer: number | undefined;
let unsubscribe: (() => void) | null = null;
/** Bumped to drop speech whose TTS request was overtaken (talk, mute, hang up). */
let speech = 0;

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

function cancelGrace(): void {
	window.clearTimeout(graceTimer);
	graceTimer = undefined;
}

/** Ask main whether calls can work (the key is there). */
export async function loadVoiceAvailability(): Promise<void> {
	const voice = voiceApi();
	const availability: VoiceAvailability = voice
		? await voice
				.available()
				.catch((error: unknown) => ({ available: false, reason: reason(error) }))
		: { available: false, reason: "This build has no voice calls." };
	useCall.setState({ availability });
}

export function startCall(): void {
	if (useCall.getState().active || !voiceApi()) return;
	useCall.setState({
		active: true,
		phase: "ready",
		error: null,
		hint: null,
		watch: null,
		since: Date.now(),
	});
	unsubscribe = window.office.chief.onMessage(noteMessage);
}

export function hangUp(): void {
	window.clearTimeout(capTimer);
	cancelGrace();
	unsubscribe?.();
	unsubscribe = null;
	void recording?.then((open) => open?.cancel());
	recording = null;
	silence();
	useCall.setState({ active: false, phase: "ready", watch: null, error: null, hint: null });
}

export function toggleMute(): void {
	const muted = !useCall.getState().muted;
	if (muted) silence();
	useCall.setState((state) => ({
		muted,
		phase: muted && state.phase === "speaking" ? "ready" : state.phase,
	}));
}

/** Stop Max mid-sentence (and any speech still being fetched). */
function silence(): void {
	speech += 1;
	stopPlayback();
}

export function startTalking(): void {
	const { active, phase } = useCall.getState();
	if (!active || recording || phase === "transcribing") return;
	silence();
	useCall.setState({ phase: "recording", error: null, hint: null });
	recording = startRecording().catch((error: unknown) => {
		log.warn("microphone failed", { error });
		recording = null;
		useCall.setState({ phase: "ready", error: `Voice error: microphone: ${reason(error)}` });
		return null;
	});
	capTimer = window.setTimeout(() => void stopTalking(), TURN_MAX_MS);
}

export function toggleTalking(): void {
	if (useCall.getState().phase === "recording") void stopTalking();
	else startTalking();
}

/** End the turn: transcribe it and send it to the chief as a call turn. */
export async function stopTalking(): Promise<void> {
	window.clearTimeout(capTimer);
	const pending = recording;
	recording = null;
	const open = await pending;
	if (!open) return;
	const clip = await open.stop();
	if (!useCall.getState().active) return;
	if (clip.durationMs < TURN_MIN_MS) {
		useCall.setState({ phase: "ready", hint: "Hold Talk while you speak" });
		return;
	}
	useCall.setState({ phase: "transcribing" });
	const heard = await transcribe(clip.bytes, clip.mimeType);
	if (heard === null || !useCall.getState().active) return;
	if (heard.length === 0) {
		useCall.setState({ phase: "ready", hint: "Didn't catch that" });
		return;
	}
	await sendTurn(heard);
}

async function transcribe(bytes: Uint8Array, mimeType: string): Promise<string | null> {
	const voice = voiceApi();
	const result = voice
		? await voice
				.transcribe(bytes, mimeType)
				.catch((error: unknown) => ({ ok: false as const, reason: reason(error) }))
		: { ok: false as const, reason: "no voice in this build" };
	if (result.ok) return result.value;
	useCall.setState({ phase: "ready", error: `Voice error: ${result.reason}` });
	return null;
}

async function sendTurn(text: string): Promise<void> {
	// Watch from before the send: he can start working before the send returns.
	cancelGrace();
	useCall.setState({ watch: NEW_TURN });
	const result = await sendToChief(text, { call: true });
	if (result.state === "rejected") {
		useCall.setState({
			phase: "ready",
			watch: null,
			error: `Not sent: ${result.reason ?? "refused"}`,
		});
		return;
	}
	useCall.setState((state) => ({
		phase:
			result.state === "queued" ? "queued" : state.phase === "transcribing" ? "sent" : state.phase,
		watch:
			result.state === "sent" && state.watch ? { ...state.watch, delivered: true } : state.watch,
	}));
}

function noteMessage(message: ChiefMessage): void {
	const state = useCall.getState();
	if (!state.active) return;
	const { watch, spoken } = watchMessage(state.watch, message, state.since);
	if (watch !== state.watch) useCall.setState({ watch });
	if (spoken === null) return;
	cancelGrace();
	void speak(spoken);
}

async function speak(text: string): Promise<void> {
	const { muted, phase } = useCall.getState();
	// Talking or muted: the caption in the chat is the answer.
	if (phase === "recording" || phase === "transcribing") return;
	if (muted) {
		useCall.setState({ phase: "ready" });
		return;
	}
	const mine = ++speech;
	const voice = voiceApi();
	const result = voice
		? await voice
				.speak(text)
				.catch((error: unknown) => ({ ok: false as const, reason: reason(error) }))
		: null;
	if (mine !== speech || !result) return;
	if (!result.ok) {
		useCall.setState({ phase: "ready", error: `Voice error: ${result.reason}` });
		return;
	}
	useCall.setState({ phase: "speaking", error: null });
	await playMp3(result.value).catch((error: unknown) => log.warn("playback failed", { error }));
	if (mine === speech) useCall.setState({ phase: "ready" });
}

/** Follow the chief's presence: working on the turn, or done with it (spoken line or not). */
export function notePresence(presence: ChiefPresence): void {
	const state = useCall.getState();
	if (!state.active) return;
	const { watch, step } = watchPresence(state.watch, presence);
	if (watch !== state.watch) useCall.setState({ watch });
	if (step === "working") {
		cancelGrace();
		if (state.phase === "sent" || state.phase === "queued") useCall.setState({ phase: "working" });
	}
	if (step === "finished" && graceTimer === undefined)
		graceTimer = window.setTimeout(repliedInChat, SPOKEN_GRACE_MS);
}

/** He finished without a spoken line: chime and point at the chat; markdown is never read out. */
function repliedInChat(): void {
	graceTimer = undefined;
	const state = useCall.getState();
	if (!state.active || state.watch === null) return;
	chime();
	const busy = state.phase === "recording" || state.phase === "transcribing";
	useCall.setState({ watch: null, phase: busy ? state.phase : "replied" });
}
