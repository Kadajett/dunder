let context: AudioContext | null = null;
let playing: { readonly source: AudioBufferSourceNode; readonly done: () => void } | null = null;

function audio(): AudioContext {
	context ??= new AudioContext();
	return context;
}

async function playBuffer(buffer: AudioBuffer): Promise<void> {
	stopPlayback();
	const ctx = audio();
	if (ctx.state === "suspended") await ctx.resume();
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

/** Plays MP3 bytes; resolves when they end or `stopPlayback` cuts them off. */
export async function playMp3(bytes: Uint8Array): Promise<void> {
	// decodeAudioData detaches its buffer, so it gets a copy.
	return playBuffer(await audio().decodeAudioData(bytes.slice().buffer));
}

/** Plays raw mono samples (the mic test) back on the speakers. */
export function playPcm(samples: Float32Array, sampleRate: number): Promise<void> {
	const buffer = audio().createBuffer(1, Math.max(1, samples.length), sampleRate);
	buffer.copyToChannel(new Float32Array(samples), 0);
	return playBuffer(buffer);
}

export function stopPlayback(): void {
	const current = playing;
	playing = null;
	if (!current) return;
	current.source.onended = null;
	current.source.stop();
	current.done();
}
