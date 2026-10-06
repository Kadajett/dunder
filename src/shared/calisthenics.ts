import { z } from "zod";
import type { Unsubscribe } from "./screens";

/** Why a workout started: the daily schedule, the wall bell, or an agent compacting on its own. */
export const workoutReasonSchema = z.enum(["daily", "manual", "compaction"]);
export type WorkoutReason = z.infer<typeof workoutReasonSchema>;

/** One group workout. Every participant derives its pose from `Date.now() - startedAt`. */
export interface Workout {
	readonly id: string;
	readonly reason: WorkoutReason;
	/** Epoch milliseconds; shared by every participant so they move in sync. */
	readonly startedAt: number;
	/** Names of the agents that take part. */
	readonly agents: readonly string[];
}

export type Move = "reach" | "tree" | "warrior" | "fold" | "jacks" | "breathe";

export interface RoutineStep {
	readonly move: Move;
	readonly seconds: number;
	/** Mirror the move left/right (tree on the other leg, warrior to the other side). */
	readonly mirror: boolean;
}

/** Seconds everyone gets to walk from their desk to their workout spot. */
export const GATHER_SECONDS = 14;

/** The choreography after gathering; walking back to the desks follows it. */
export const ROUTINE: readonly RoutineStep[] = [
	{ move: "reach", seconds: 8, mirror: false },
	{ move: "tree", seconds: 7, mirror: false },
	{ move: "tree", seconds: 7, mirror: true },
	{ move: "warrior", seconds: 7, mirror: false },
	{ move: "warrior", seconds: 7, mirror: true },
	{ move: "fold", seconds: 7, mirror: false },
	{ move: "jacks", seconds: 12, mirror: false },
	{ move: "breathe", seconds: 8, mirror: false },
];

/** From start signal to the moment agents head back to their desks. */
export const WORKOUT_SECONDS =
	GATHER_SECONDS + ROUTINE.reduce((total, step) => total + step.seconds, 0);

/** `window.office.calisthenics`: workouts pushed from main, plus the wall bell. */
export interface CalisthenicsApi {
	onWorkout(listener: (workout: Workout) => void): Unsubscribe;
	/** Workouts that are still running (for a window that loads mid-workout). */
	active(): Promise<readonly Workout[]>;
	/** Ring the bell: a manual workout for every live agent, starting now. */
	startNow(): Promise<void>;
}
