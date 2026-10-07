/** One push-to-talk recording: stop for the clip, or cancel to throw it away. Both release the mic. */
export interface Recording {
	stop(): Promise<Clip>;
	cancel(): void;
}

export interface Clip {
	readonly bytes: Uint8Array;
	readonly mimeType: string;
	readonly durationMs: number;
}

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];

/** Opens the mic (only while talking, so it is off between turns) and starts recording. */
export async function startRecording(): Promise<Recording> {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: { echoCancellation: true, noiseSuppression: true },
	});
	const mimeType = PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
	const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
	const chunks: Blob[] = [];
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};
	const started = performance.now();
	recorder.start();
	const release = () => {
		for (const track of stream.getTracks()) track.stop();
	};
	return {
		async stop() {
			const stopped = Promise.withResolvers<void>();
			recorder.onstop = () => stopped.resolve();
			recorder.stop();
			await stopped.promise;
			release();
			const type = recorder.mimeType || mimeType || "audio/webm";
			const blob = new Blob(chunks, { type });
			return {
				bytes: new Uint8Array(await blob.arrayBuffer()),
				mimeType: type,
				durationMs: performance.now() - started,
			};
		},
		cancel() {
			if (recorder.state !== "inactive") recorder.stop();
			release();
		},
	};
}

let context: AudioContext | null = null;
let playing: { readonly source: AudioBufferSourceNode; readonly done: () => void } | null = null;

function audio(): AudioContext {
	context ??= new AudioContext();
	return context;
}

/** Plays MP3 bytes; resolves when they end or `stopPlayback` cuts them off. */
export async function playMp3(bytes: Uint8Array): Promise<void> {
	stopPlayback();
	const ctx = audio();
	if (ctx.state === "suspended") await ctx.resume();
	// decodeAudioData detaches its buffer, so it gets a copy.
	const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
	const source = ctx.createBufferSource();
	source.buffer = buffer;
	source.connect(ctx.destination);
	const ended = Promise.withResolvers<void>();
	const entry = { source, done: ended.resolve };
	source.onended = () => {
		if (playing === entry) playing = null;
		ended.resolve();
	};
	playing = entry;
	source.start();
	return ended.promise;
}

export function stopPlayback(): void {
	const current = playing;
	playing = null;
	if (!current) return;
	current.source.onended = null;
	current.source.stop();
	current.done();
}

/** A soft two-note chime: "he answered, look at the chat". */
export function chime(): void {
	const ctx = audio();
	const start = ctx.currentTime;
	for (const [index, frequency] of [660, 880].entries()) {
		const tone = ctx.createOscillator();
		const gain = ctx.createGain();
		const at = start + index * 0.16;
		tone.type = "sine";
		tone.frequency.value = frequency;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
		tone.connect(gain).connect(ctx.destination);
		tone.start(at);
		tone.stop(at + 0.4);
	}
}
