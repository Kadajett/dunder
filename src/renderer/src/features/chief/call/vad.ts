/** How the open mic decides Jeremy is talking. Levels are RMS of samples in [-1, 1]. */
export interface VadTuning {
	/** Speech must stay above the threshold this long to count (a cough or a click doesn't). */
	readonly startMs: number;
	/** This much quiet ends the utterance (a pause between words doesn't). */
	readonly endMs: number;
	/** An utterance is cut and sent after this long, talking or not. */
	readonly maxMs: number;
	/** Speech is this many times the noise floor… */
	readonly ratio: number;
	/** …and never quieter than this, so a silent room doesn't trigger on hiss. */
	readonly minLevel: number;
	/** While Max is speaking, Jeremy must be this much louder again: his voice leaking from the speakers isn't Jeremy. */
	readonly echoRatio: number;
	/** The first frames only measure the room (about half a second), so steady noise isn't speech. */
	readonly calibrateFrames: number;
}

export const VAD_TUNING: VadTuning = {
	startMs: 150,
	endMs: 800,
	maxMs: 30_000,
	ratio: 3,
	minLevel: 0.012,
	echoRatio: 2.5,
	calibrateFrames: 8,
};

export interface VadState {
	/** Estimated background level: falls fast to quiet frames, rises slowly. */
	readonly floor: number;
	readonly phase: "quiet" | "onset" | "speech" | "trailing";
	/** When the current phase began (onset or trailing). */
	readonly since: number;
	/** When the current utterance began (its onset). */
	readonly start: number;
	/** Frames measured so far while calibrating. */
	readonly heard: number;
}

export const INITIAL_VAD: VadState = { floor: 0, phase: "quiet", since: 0, start: 0, heard: 0 };

export interface VadFrame {
	readonly level: number;
	/** Milliseconds, monotonic. */
	readonly at: number;
	/** Max's voice is playing. */
	readonly playing: boolean;
}

/** `start` at speech onset (dated to `state.start`), `end` after enough quiet, `cap` at the length limit. */
export type VadEvent = "start" | "end" | "cap" | null;

export function vadThreshold(state: VadState, playing: boolean, tuning = VAD_TUNING): number {
	const base = Math.max(state.floor * tuning.ratio, tuning.minLevel);
	return playing ? base * tuning.echoRatio : base;
}

function nextFloor(floor: number, level: number, speaking: boolean): number {
	if (level < floor) return floor * 0.7 + level * 0.3;
	// Speech must not teach the floor that talking is background.
	return speaking ? floor : floor * 0.995 + level * 0.005;
}

type Step = { readonly state: VadState; readonly event: VadEvent };

/** The phase change for one frame, given whether it is loud; `state.floor` is already updated. */
function advance(state: VadState, loud: boolean, at: number, tuning: VadTuning): Step {
	switch (state.phase) {
		case "quiet":
			return {
				state: loud ? { ...state, phase: "onset", since: at, start: at } : state,
				event: null,
			};
		case "onset":
			if (!loud) return { state: { ...state, phase: "quiet" }, event: null };
			if (at - state.since < tuning.startMs) return { state, event: null };
			return { state: { ...state, phase: "speech" }, event: "start" };
		case "speech":
			return { state: loud ? state : { ...state, phase: "trailing", since: at }, event: null };
		case "trailing":
			if (loud) return { state: { ...state, phase: "speech" }, event: null };
			if (at - state.since < tuning.endMs) return { state, event: null };
			return { state: { ...state, phase: "quiet", since: at }, event: "end" };
	}
}

/** One frame of the detector: pure, so it is tested with synthetic levels and no timers. */
export function stepVad(state: VadState, frame: VadFrame, tuning = VAD_TUNING): Step {
	if (state.heard < tuning.calibrateFrames) {
		const floor = (state.floor * state.heard + frame.level) / (state.heard + 1);
		return { state: { ...state, floor, heard: state.heard + 1 }, event: null };
	}
	const loud = frame.level > vadThreshold(state, frame.playing, tuning);
	const speaking = state.phase === "speech" || state.phase === "trailing";
	const floor = nextFloor(state.floor, frame.level, speaking || loud);
	if (speaking && frame.at - state.start >= tuning.maxMs)
		return {
			state: { ...state, floor, phase: "quiet", since: frame.at, start: frame.at },
			event: "cap",
		};
	return advance({ ...state, floor }, loud, frame.at, tuning);
}
