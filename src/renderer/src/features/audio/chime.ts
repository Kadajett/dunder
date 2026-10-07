let context: AudioContext | null = null;

/** The app's one soft two-note chime: "look over here" (a call reply in chat, an agent needing Jeremy). */
export function chime(): void {
	context ??= new AudioContext();
	const ctx = context;
	// A context created without a gesture starts suspended; resuming is allowed in Electron.
	if (ctx.state === "suspended") void ctx.resume();
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
