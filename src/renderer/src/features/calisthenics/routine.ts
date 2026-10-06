import { GATHER_SECONDS, ROUTINE, type RoutineStep } from "@shared/calisthenics";

/** Seconds a move takes to flow out of the previous one. */
export const BLEND_SECONDS = 0.8;

const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** Where in the routine a moment falls. Reused across frames so they never allocate. */
export class Cue {
	/** The move being performed; undefined while gathering and once the routine is over. */
	step: RoutineStep | undefined = undefined;
	/** The move flowing into `step`; undefined for the first move (it starts from standing). */
	previous: RoutineStep | undefined = undefined;
	/** Seconds into `step`. */
	local = 0;
	/** 0 → 1 over the first `BLEND_SECONDS` of `step`, eased. */
	blend = 1;

	/** Point this cue at `elapsed` seconds since the workout signal. */
	at(elapsed: number): this {
		this.step = undefined;
		this.previous = undefined;
		this.local = 0;
		this.blend = 1;
		let start = GATHER_SECONDS;
		if (elapsed < start) return this;
		for (let i = 0; i < ROUTINE.length; i++) {
			const step = ROUTINE[i];
			if (!step) break;
			if (elapsed < start + step.seconds) {
				this.step = step;
				this.previous = ROUTINE[i - 1];
				this.local = elapsed - start;
				this.blend = smoothstep(Math.min(1, this.local / BLEND_SECONDS));
				return this;
			}
			start += step.seconds;
		}
		return this;
	}
}
