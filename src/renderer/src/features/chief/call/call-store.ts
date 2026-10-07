import type { ChiefMessage, ChiefPresence } from "@shared/chief";
import { createLogger } from "@shared/log/logger";
import type { CallResume, VoiceAvailability } from "@shared/voice";
import { create } from "zustand";
import { chime } from "../../audio/chime";
import { soundsOn, useSounds } from "../../audio/sound-store";
import { sendToChief } from "../chat-store";
import { playMp3, stopPlayback } from "./call-audio";
import { closeMic, openMic, savedMicId, saveMicId, setMicMuted, setMicPlaying } from "./call-mic";
import { resumedHint, resumedNote } from "./call-resume";
import {
	type CallPhase,
	NEW_TURN,
	type TurnWatch,
	watchMessage,
	watchPresence,
	worthSending,
} from "./call-turn";
import { micErrorMessage } from "./mic-errors";

const log = createLogger("call");

/** After he goes idle, how long his spoken line may still take to come out of the session log. */
const SPOKEN_GRACE_MS = 3_000;

interface CallState {
	/** Null until asked; calls need the ElevenLabs key in main. */
	readonly availability: VoiceAvailability | null;
	readonly active: boolean;
	readonly phase: CallPhase;
	/** Jeremy's mic is muted: nothing he says is heard or sent. */
	readonly muted: boolean;
	/** The input in use, once open. */
	readonly mic: { readonly deviceId: string | undefined; readonly label: string } | null;
	/** Live mic level (RMS) for the meter. */
	readonly level: number;
	/** What Scribe heard last, as sent to the chief. */
	readonly heard: string | null;
	/** A mic or voice failure, worded for Jeremy; until the next success. */
	readonly error: string | null;
	/** A gentle note, e.g. "Didn't catch that". */
	readonly hint: string | null;
	/** Max's last spoken line, shown instead of played while Sounds are off. */
	readonly caption: string | null;
	readonly watch: TurnWatch | null;
	/** When this round of the call's turns started; earlier messages never count. */
	readonly since: number;
	/** When Jeremy picked up (kept across an update relaunch). */
	readonly startedAt: number;
}

const IDLE = {
	active: false,
	phase: "listening",
	muted: false,
	mic: null,
	level: 0,
	heard: null,
	error: null,
	hint: null,
	caption: null,
	watch: null,
	since: 0,
	startedAt: 0,
} as const satisfies Omit<CallState, "availability">;

export const useCall = create<CallState>(() => ({ availability: null, ...IDLE }));

const voiceApi = () => ("voice" in window.office ? window.office.voice : null);
const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

let graceTimer: number | undefined;
let unsubscribe: (() => void) | null = null;
/** Utterances are transcribed and sent one at a time, in the order he said them. */
let turns: Promise<void> = Promise.resolve();
/** Bumped to drop speech whose TTS request was overtaken (barge-in, hang up). */
let speech = 0;
/** The line Max is saying now, to caption if Sounds go off mid-sentence. */
let saying = "";

function cancelGrace(): void {
	window.clearTimeout(graceTimer);
	graceTimer = undefined;
}

/** The phase once nothing is being said or played: where the chief is with the last turn. */
function restingPhase(watch: TurnWatch | null): CallPhase {
	if (watch === null) return "listening";
	if (!watch.delivered) return "queued";
	return watch.sawWorking ? "thinking" : "heard";
}

/** Ask main whether calls can work (the key is there). */
export async function loadVoiceAvailability(): Promise<void> {
	const voice = voiceApi();
	const availability: VoiceAvailability = voice
		? await voice
				.available()
				.catch((error: unknown) => ({ available: false, reason: reasonOf(error) }))
		: { available: false, reason: "This build has no voice calls." };
	useCall.setState({ availability });
}

export function startCall(): void {
	if (useCall.getState().active || !voiceApi()) return;
	const now = Date.now();
	useCall.setState({ ...IDLE, active: true, since: now, startedAt: now });
	unsubscribe = window.office.chief.onMessage(noteMessage);
	void switchMic(savedMicId());
}

/**
 * Pick the call back up after an update relaunched the app: same mic, same
 * mute, no click. Max hears that it dropped, and says he's back.
 */
export async function resumeCall(resume: CallResume, now: number): Promise<void> {
	if (useCall.getState().active || !voiceApi()) return;
	const hint = resumedHint(resume, now);
	useCall.setState({
		...IDLE,
		active: true,
		since: now,
		startedAt: resume.startedAt,
		muted: resume.muted,
		hint,
	});
	unsubscribe = window.office.chief.onMessage(noteMessage);
	await switchMic(resume.deviceId);
	if (useCall.getState().active) await sendTurn(resumedNote(resume, now), null);
}

export function hangUp(): void {
	cancelGrace();
	unsubscribe?.();
	unsubscribe = null;
	closeMic();
	silence();
	useCall.setState(IDLE);
}

/** Open the given input (null: the default) for the call, wording any failure. */
export async function switchMic(deviceId: string | null): Promise<void> {
	try {
		const opened = await openMic(deviceId, {
			level: (level) => useCall.setState({ level }),
			speech: heardSpeech,
			utterance: (wav) => {
				turns = turns.then(() => handleUtterance(wav));
			},
			lost: () => {
				useCall.setState({ hint: "Your mic went away; switched to the default input." });
				void switchMic(null);
			},
		});
		if (!useCall.getState().active) return closeMic();
		setMicMuted(useCall.getState().muted);
		useCall.setState({
			mic: { deviceId: opened.deviceId, label: opened.label },
			error: null,
			...(opened.fellBack && {
				hint: `Your chosen mic is gone; using ${opened.label || "the default"}.`,
			}),
		});
	} catch (error) {
		log.warn("microphone failed", { error });
		useCall.setState({ mic: null, level: 0, error: micErrorMessage(error) });
	}
}

/** Pick an input in the Mic popover: remembered, and the call switches to it now. */
export function chooseMic(deviceId: string): Promise<void> {
	saveMicId(deviceId);
	return switchMic(deviceId);
}

export function toggleMute(): void {
	const muted = !useCall.getState().muted;
	setMicMuted(muted);
	useCall.setState((state) => ({
		muted,
		phase: muted && state.phase === "hearing" ? restingPhase(state.watch) : state.phase,
	}));
}

/** Stop Max mid-sentence (and any speech still being fetched). */
function silence(): void {
	speech += 1;
	setMicPlaying(false);
	stopPlayback();
}

/** Jeremy started talking: barge in over Max. */
function heardSpeech(): void {
	if (!useCall.getState().active) return;
	silence();
	useCall.setState({ phase: "hearing", hint: null });
}

async function handleUtterance(wav: Uint8Array): Promise<void> {
	const voice = voiceApi();
	if (!voice || !useCall.getState().active) return;
	useCall.setState({ phase: "transcribing" });
	const result = await voice
		.transcribe(wav, "audio/wav")
		.catch((error: unknown) => ({ ok: false as const, reason: reasonOf(error) }));
	const state = useCall.getState();
	if (!state.active) return;
	const busy = state.phase === "hearing";
	const settle = busy ? state.phase : restingPhase(state.watch);
	if (!result.ok) {
		useCall.setState({ phase: settle, error: `Voice error: ${result.reason}` });
		return;
	}
	if (!worthSending(result.value)) {
		useCall.setState({ phase: settle, hint: "Didn't catch that" });
		return;
	}
	await sendTurn(result.value);
}

/** `heard`: what the strip shows as Jeremy's words (null for the app's own notes to Max). */
async function sendTurn(text: string, heard: string | null = text): Promise<void> {
	// Watch from before the send: he can start working before the send returns.
	cancelGrace();
	useCall.setState({
		watch: NEW_TURN,
		heard,
		error: null,
		caption: null,
		hint: heard === null ? useCall.getState().hint : null,
	});
	const result = await sendToChief(text, { call: true });
	if (result.state === "rejected") {
		useCall.setState({
			phase: "listening",
			watch: null,
			error: `Not sent: ${result.reason ?? "refused"}`,
		});
		return;
	}
	useCall.setState((state) => {
		const watch =
			result.state === "sent" && state.watch ? { ...state.watch, delivered: true } : state.watch;
		return { watch, phase: state.phase === "hearing" ? state.phase : restingPhase(watch) };
	});
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

/** Sounds are off: Max's line goes in the strip as a caption, unplayed. */
function caption(text: string): void {
	useCall.setState((state) => ({
		caption: text,
		phase: state.phase === "hearing" ? state.phase : restingPhase(state.watch),
	}));
}

// Sounds switched off while Max talks: cut him off and caption the rest.
useSounds.subscribe(({ on }) => {
	if (on || useCall.getState().phase !== "speaking") return;
	silence();
	caption(saying);
});

async function speak(text: string): Promise<void> {
	// Talking over him already: the caption in the chat is the answer.
	if (useCall.getState().phase === "hearing") return;
	if (!soundsOn()) return caption(text);
	const mine = ++speech;
	const voice = voiceApi();
	const result = voice
		? await voice
				.speak(text)
				.catch((error: unknown) => ({ ok: false as const, reason: reasonOf(error) }))
		: null;
	if (mine !== speech || !result || !useCall.getState().active) return;
	if (!soundsOn()) return caption(text);
	if (!result.ok) {
		useCall.setState((state) => ({
			phase: restingPhase(state.watch),
			error: `Voice error: ${result.reason}`,
		}));
		return;
	}
	saying = text;
	useCall.setState({ phase: "speaking", error: null, caption: null });
	setMicPlaying(true);
	await playMp3(result.value).catch((error: unknown) => log.warn("playback failed", { error }));
	if (mine !== speech) return;
	setMicPlaying(false);
	useCall.setState((state) => ({ phase: restingPhase(state.watch) }));
}

/** Follow the chief's presence: thinking about the turn, or done with it (spoken line or not). */
export function notePresence(presence: ChiefPresence): void {
	const state = useCall.getState();
	if (!state.active) return;
	const { watch, step } = watchPresence(state.watch, presence);
	if (watch !== state.watch) useCall.setState({ watch });
	if (step === "working") {
		cancelGrace();
		if (state.phase === "heard" || state.phase === "queued")
			useCall.setState({ phase: "thinking" });
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
	const busy = state.phase === "hearing" || state.phase === "transcribing";
	useCall.setState({ watch: null, phase: busy ? state.phase : "replied" });
}
