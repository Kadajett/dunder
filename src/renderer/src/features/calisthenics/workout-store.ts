import { WORKOUT_SECONDS, type Workout } from "@shared/calisthenics";
import { useEffect } from "react";
import { create } from "zustand";

/** Workouts are forgotten this long after they end (everyone is back at their desk by then). */
const KEEP_MS = (WORKOUT_SECONDS + 60) * 1_000;

interface WorkoutState {
	readonly workouts: readonly Workout[];
	add(workout: Workout): void;
}

const useWorkoutStore = create<WorkoutState>((set) => ({
	workouts: [],
	add: (workout) =>
		set((state) => {
			if (state.workouts.some((known) => known.id === workout.id)) return state;
			const now = Date.now();
			const recent = state.workouts.filter((known) => now - known.startedAt < KEEP_MS);
			return { workouts: [...recent, workout] };
		}),
}));

let connected = false;

/** Listen for workouts from main once per page, catching up on any already running. */
function connect(): void {
	if (connected) return;
	connected = true;
	const { add } = useWorkoutStore.getState();
	const api = window.office.calisthenics;
	api.onWorkout(add);
	void api.active().then((running) => {
		for (const workout of running) add(workout);
	});
}

/** The latest workout `agentName` takes part in, if any is still remembered. */
export function useAgentWorkout(agentName: string): Workout | undefined {
	useEffect(connect, []);
	return useWorkoutStore((state) =>
		state.workouts.findLast((workout) => workout.agents.includes(agentName)),
	);
}

/** The wall bell: a workout for everyone, now. */
export function ringBell(): void {
	void window.office.calisthenics.startNow();
}
