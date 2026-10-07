import { describe, expect, it } from "vitest";
import { INITIAL_VAD, stepVad, VAD_TUNING, type VadEvent } from "./vad";

const FRAME_MS = 64;
const QUIET = 0.003;
const SPEECH = 0.08;

/** Feed `levels` (one per 64 ms frame) and return the events with their frame times. */
function run(levels: readonly number[], playing = false): string[] {
	let state = INITIAL_VAD;
	const events: string[] = [];
	for (const [index, level] of levels.entries()) {
		const step = stepVad(state, { level, at: index * FRAME_MS, playing });
		state = step.state;
		if (step.event) events.push(`${step.event as Exclude<VadEvent, null>}@${index * FRAME_MS}`);
	}
	return events;
}

const frames = (level: number, ms: number) => Array<number>(Math.ceil(ms / FRAME_MS)).fill(level);

describe("stepVad", () => {
	it("finds an utterance: starts after 150 ms of speech, ends after 800 ms of quiet", () => {
		const events = run([...frames(QUIET, 1000), ...frames(SPEECH, 1500), ...frames(QUIET, 1500)]);
		expect(events).toEqual(["start@1216", "end@3392"]);
	});

	it("ignores a click shorter than the onset, and keeps one utterance across a short pause", () => {
		expect(run([...frames(QUIET, 500), SPEECH, ...frames(QUIET, 500)])).toEqual([]);
		const pause = run([
			...frames(QUIET, 500),
			...frames(SPEECH, 600),
			...frames(QUIET, 400),
			...frames(SPEECH, 600),
			...frames(QUIET, 1200),
		]);
		expect(pause.filter((event) => event.startsWith("start"))).toHaveLength(1);
		expect(pause.filter((event) => event.startsWith("end"))).toHaveLength(1);
	});

	it("cuts an utterance at the length cap", () => {
		const events = run([...frames(QUIET, 500), ...frames(SPEECH, VAD_TUNING.maxMs + 1000)]);
		expect(events[0]).toMatch(/^start@/);
		expect(events.some((event) => event.startsWith("cap@"))).toBe(true);
	});

	it("adapts to a noisy room instead of hearing the noise as speech", () => {
		expect(run(frames(0.02, 5000))).toEqual([]);
	});

	it("does not trigger on Max's voice leaking from the speakers, but does on Jeremy talking over him", () => {
		const leak = 0.025;
		expect(run([...frames(QUIET, 500), ...frames(leak, 2000)], true)).toEqual([]);
		expect(run([...frames(QUIET, 500), ...frames(0.2, 600)], true)[0]).toMatch(/^start@/);
	});
});
