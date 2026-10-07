import { isDeviceGone } from "./mic-errors";
import { INITIAL_VAD, stepVad, VAD_TUNING, type VadState } from "./vad";
import { encodeWav, rms } from "./wav";

/** Scribe is happy with 16 kHz speech; it keeps utterances small. */
export const MIC_RATE = 16_000;
/** ~64 ms frames: fine enough for the detector's 150 ms onset. */
const FRAME = 1024;
/** Audio kept from before the onset is detected, so first syllables aren't clipped. */
const PREROLL_FRAMES = 8;
/** Quiet kept after the last word (the detector waits 800 ms; the rest is cut). */
const TAIL_MS = 300;

export interface LiveMicEvents {
	/** Every frame's level (RMS), for the meter. */
	level(level: number): void;
	/** Jeremy started talking. */
	speech(): void;
	/** He stopped (or hit the length cap): the utterance as WAV. */
	utterance(wav: Uint8Array): void;
	/** The input went away (unplugged, or the system took it). */
	lost(): void;
}

function concat(frames: readonly Float32Array[]): Float32Array {
	const out = new Float32Array(frames.reduce((sum, frame) => sum + frame.length, 0));
	let offset = 0;
	for (const frame of frames) {
		out.set(frame, offset);
		offset += frame.length;
	}
	return out;
}

/** Ask for the mic: the chosen input, else (when it is gone) the default one. */
async function openStream(
	deviceId: string | null,
): Promise<{ stream: MediaStream; fellBack: boolean }> {
	const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
	if (deviceId) {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: { ...audio, deviceId: { exact: deviceId } },
			});
			return { stream, fellBack: false };
		} catch (error) {
			if (!isDeviceGone(error)) throw error;
		}
	}
	return {
		stream: await navigator.mediaDevices.getUserMedia({ audio }),
		fellBack: deviceId !== null,
	};
}

/**
 * The call's open mic: levels for the meter, and each utterance (found by
 * the voice activity detector) as a WAV clip. Muted, it hears nothing; while
 * Max plays, the detector needs Jeremy louder than the speaker leak.
 */
export class LiveMic {
	playing = false;
	readonly #stream: MediaStream;
	readonly #context: AudioContext;
	readonly #events: LiveMicEvents;
	#muted = false;
	#vad: VadState = INITIAL_VAD;
	#recent: Float32Array[] = [];
	#utterance: Float32Array[] | null = null;
	#test: {
		readonly frames: Float32Array[];
		readonly want: number;
		readonly done: (pcm: Float32Array) => void;
	} | null = null;

	private constructor(stream: MediaStream, events: LiveMicEvents) {
		this.#stream = stream;
		this.#events = events;
		this.#context = new AudioContext({ sampleRate: MIC_RATE });
		const source = this.#context.createMediaStreamSource(stream);
		// ScriptProcessor: no worklet module to ship past the CSP, and 64 ms frames are plenty here.
		const processor = this.#context.createScriptProcessor(FRAME, 1, 1);
		const silent = this.#context.createGain();
		silent.gain.value = 0;
		processor.onaudioprocess = (event) =>
			this.#frame(new Float32Array(event.inputBuffer.getChannelData(0)));
		const track = stream.getAudioTracks()[0];
		if (track) track.onended = () => events.lost();
		source.connect(processor);
		processor.connect(silent).connect(this.#context.destination);
	}

	static async open(
		deviceId: string | null,
		events: LiveMicEvents,
	): Promise<{ readonly mic: LiveMic; readonly fellBack: boolean }> {
		const { stream, fellBack } = await openStream(deviceId);
		return { mic: new LiveMic(stream, events), fellBack };
	}

	/** The input actually in use (the default's real id once permission is granted). */
	get deviceId(): string | undefined {
		return this.#stream.getAudioTracks()[0]?.getSettings().deviceId;
	}

	get label(): string {
		return this.#stream.getAudioTracks()[0]?.label ?? "";
	}

	/** Muting drops whatever was being said. */
	setMuted(muted: boolean): void {
		this.#muted = muted;
		if (muted) this.#reset();
	}

	/** Record `ms` of audio for a local test; nothing is sent meanwhile. */
	record(ms: number): Promise<Float32Array> {
		const { promise, resolve } = Promise.withResolvers<Float32Array>();
		this.#reset();
		this.#test = { frames: [], want: Math.ceil((ms / 1000) * MIC_RATE), done: resolve };
		return promise;
	}

	close(): void {
		this.#test?.done(new Float32Array());
		this.#test = null;
		for (const track of this.#stream.getTracks()) track.stop();
		void this.#context.close();
	}

	#reset(): void {
		// Back to quiet, keeping what was learnt about the room.
		this.#vad = { ...INITIAL_VAD, floor: this.#vad.floor, heard: this.#vad.heard };
		this.#utterance = null;
	}

	#frame(frame: Float32Array): void {
		const level = rms(frame);
		this.#events.level(level);
		if (this.#test) {
			this.#testFrame(frame);
			return;
		}
		if (this.#muted) return;
		this.#recent = [...this.#recent.slice(1 - PREROLL_FRAMES), frame];
		const at = this.#context.currentTime * 1000;
		const { state, event } = stepVad(this.#vad, { level, at, playing: this.playing });
		this.#vad = state;
		if (event === "start") {
			this.#utterance = [...this.#recent];
			this.#events.speech();
			return;
		}
		this.#utterance?.push(frame);
		if (event === "end" || event === "cap") this.#finish(event === "end");
	}

	#finish(quietTail: boolean): void {
		const frames = this.#utterance ?? [];
		this.#utterance = null;
		const msPerFrame = (FRAME / MIC_RATE) * 1000;
		const drop = quietTail ? Math.floor((VAD_TUNING.endMs - TAIL_MS) / msPerFrame) : 0;
		const kept = frames.slice(0, Math.max(1, frames.length - drop));
		this.#events.utterance(encodeWav(concat(kept), MIC_RATE));
	}

	#testFrame(frame: Float32Array): void {
		const test = this.#test;
		if (!test) return;
		test.frames.push(frame);
		if (test.frames.length * FRAME < test.want) return;
		this.#test = null;
		test.done(concat(test.frames));
	}
}
